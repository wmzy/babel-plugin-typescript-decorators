// import runner from "@babel/helper-plugin-test-runner/esm.mjs";
// 
// runner(import.meta.url);
const runner = require("@babel/helper-plugin-test-runner").default;
runner(__dirname);
