const path=require('path');
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'sdk-entry.cjs')], outfile:path.join(__dirname,'../vendor/reporter.cjs'),bundle:true,platform:'node',target:'node18',format:'cjs',minify:true,legalComments:'eof'});
