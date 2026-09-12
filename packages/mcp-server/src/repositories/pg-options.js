// Opciones de conexión a Postgres compartidas por todo lo que habla con Tiger Data
// (repositorio bancario, historial de visualizaciones y el script de carga).
//
// Por qué existe: la cadena que da Tiger Cloud termina en `?sslmode=require`, y
// `pg` traduce ese modo a `verify-full`, que exige validar toda la cadena de
// certificados. En una laptop con antivirus o proxy corporativo eso falla con
// "self-signed certificate in certificate chain" aunque el servidor sea legítimo.
// Aquí se quita el parámetro de la URL y se fija el TLS explícitamente: sigue
// cifrado, sin verificar la cadena. En local (docker compose) no hay TLS.

const LOCAL_HOST_PATTERN = /@(localhost|127\.0\.0\.1|timescaledb)[:/]/;

export function isLocalConnection(connectionString) {
  return LOCAL_HOST_PATTERN.test(connectionString ?? '');
}

export function pgConnectionOptions(connectionString, extra = {}) {
  let cleaned = connectionString;
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    cleaned = url.toString();
  } catch {
    // Cadena en formato clave=valor (no URL): se usa tal cual.
  }
  return {
    connectionString: cleaned,
    ssl: isLocalConnection(connectionString) ? false : { rejectUnauthorized: false },
    ...extra,
  };
}
