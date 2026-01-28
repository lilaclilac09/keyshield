// #region agent log
fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/postcss.config.cjs:1',message:'postcss config load',data:{nodeVersion:process?.versions?.node,hasFetch:typeof fetch === 'function'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
// #endregion

const plugins = {
  '@tailwindcss/postcss': {},
  autoprefixer: {},
};

// #region agent log
fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/postcss.config.cjs:9',message:'postcss plugins configured',data:{pluginKeys:Object.keys(plugins)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
// #endregion

module.exports = {
  plugins,
};

// #region agent log
fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/postcss.config.cjs:16',message:'postcss config exported',data:{hasPlugins:!!plugins,pluginCount:Object.keys(plugins).length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
// #endregion
