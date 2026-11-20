import { renderMasFixtureApp } from './MasFixtureApp';

const root = document.getElementById('root');
if (!root) throw new Error('Fixture root missing');
renderMasFixtureApp(root);
