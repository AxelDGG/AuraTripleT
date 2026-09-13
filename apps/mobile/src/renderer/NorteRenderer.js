// Norte UI Spec v1 → componentes nativos.
//
// Este archivo es el gemelo de apps/web/public/renderer.js: recibe el arreglo
// `ui` que emitió el agente y devuelve la pantalla. Si el modelo manda un tipo
// que no existe (o llega un componente roto), se ignora ese elemento en lugar
// de tumbar la vista completa — en una demo, media pantalla vale más que un
// error rojo.

import { View } from 'react-native';
import Chart from '../charts/Chart';
import Form from './Form';
import { Alert, BalanceCards, Header, KpiGrid, Markdown, Progress, Table, TransactionList } from './components';
import { space } from '../theme/tokens';

const RENDERERS = {
  header: Header,
  kpi_grid: KpiGrid,
  balance_cards: BalanceCards,
  chart: Chart,
  table: Table,
  transaction_list: TransactionList,
  alert: Alert,
  progress: Progress,
  text: Markdown,
};

export default function NorteRenderer({ ui, onFormSubmit, formsDisabled, style }) {
  const components = Array.isArray(ui) ? ui : [];
  if (!components.length) return null;

  return (
    <View style={[{ gap: space.lg }, style]}>
      {components.map((component, index) => {
        if (!component || typeof component !== 'object') return null;

        if (component.type === 'form') {
          return (
            <Form
              key={index}
              component={component}
              onSubmit={onFormSubmit}
              disabled={formsDisabled}
            />
          );
        }

        const Component = RENDERERS[component.type];
        if (!Component) return null;
        return <Component key={index} component={component} />;
      })}
    </View>
  );
}
