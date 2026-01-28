module.exports = {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/postcss.config.js:2',message:'postcss_config_executing',data:{hasModule:typeof module !== 'undefined',hasExports:typeof module !== 'undefined' ? typeof module.exports : 'none'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
