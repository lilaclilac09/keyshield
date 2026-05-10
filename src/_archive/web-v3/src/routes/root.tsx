import App from '../App';

// Debug: log when root route renders
const RootComponent = () => {
  console.log('[rootRoute] rendering');
  return <App />;
};

export const rootRoute = {
  id: '/',
  component: RootComponent,
};
