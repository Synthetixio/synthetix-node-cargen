#!/usr/bin/env node

import { generate } from './generate.js'

const [srcDir, dstDir] = process.argv.slice(2);
generate(srcDir, dstDir).then(fileName => console.log(fileName), error => {
  console.error(error);
  process.exit(1);
});
