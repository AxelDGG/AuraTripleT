// Config plugin: compilar en Windows sin chocar con el límite de 260 caracteres.
//
// El problema: la nueva arquitectura de React Native genera código C++ y CMake
// crea un archivo objeto por cada fuente, espejando la ruta completa del origen
// dentro del directorio de compilación. Para una fuente en node_modules eso
// produce rutas como:
//
//   android\app\.cxx\RelWithDebInfo\<hash>\arm64-v8a\safeareacontext_autolinked_build\
//   CMakeFiles\react_codegen_safeareacontext.dir\C_\Users\...\node_modules\
//   react-native-safe-area-context\common\cpp\react\renderer\components\
//   safeareacontext\RNCSafeAreaViewShadowNode.cpp.o
//
// Son 267 caracteres. Windows corta en 260 salvo que se active LongPathsEnabled
// en el registro, y ninja falla con "Filename longer than 260 characters".
//
// Descartado: `CMAKE_OBJECT_PATH_MAX`, que en teoría hace que CMake acorte por
// hash las rutas de objeto largas. Se probó y CMake lo acepta en el cache
// (`CMAKE_OBJECT_PATH_MAX:UNINITIALIZED=200`) pero el generador Ninja no lo
// honra: el build falla igual. No perder tiempo ahí otra vez.
//
// Lo que sí funciona es acortar la ruta por los dos extremos:
//
//   1. Un junction de directorio a una ruta corta (`mklink /J C:\n <repo>`), que
//      no requiere administrador y recorta la parte espejada del origen.
//   2. Mover el directorio de trabajo de CMake (`.cxx`) con la variable de
//      entorno NORTE_CXX_DIR, que recorta el prefijo.
//
// Los dos juntos bajan la ruta de 267 a ~254 caracteres.
//
// Este plugin solo aplica el paso 2, y solo si NORTE_CXX_DIR está definida: así
// el repo no queda atado a una ruta de una máquina en particular. En macOS y
// Linux no hace falta nada de esto.
//
// La solución permanente y preferible es activar las rutas largas de Windows
// una sola vez (requiere administrador):
//
//   Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' `
//     -Name LongPathsEnabled -Value 1
//
// Con eso, ni junction ni NORTE_CXX_DIR hacen falta.

const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withWindowsLongPaths(config) {
  return withAppBuildGradle(config, (cfg) => {
    const cxxDir = process.env.NORTE_CXX_DIR;
    if (!cxxDir) return cfg;
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes('buildStagingDirectory')) return cfg;

    const block = `
    // Windows MAX_PATH: ver apps/mobile/plugins/withWindowsLongPaths.js
    externalNativeBuild {
        cmake {
            buildStagingDirectory = file("${cxxDir.replace(/\\/g, '/')}")
        }
    }
`;

    const patched = cfg.modResults.contents.replace(/^android\s*\{/m, (match) => match + block);
    if (patched === cfg.modResults.contents) {
      throw new Error('withWindowsLongPaths: no se encontró el bloque android en app/build.gradle.');
    }
    cfg.modResults.contents = patched;
    return cfg;
  });
};
