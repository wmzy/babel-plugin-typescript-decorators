/* eslint-disable @babel/development/plugin-name */

import { declare } from "@babel/helper-plugin-utils";
import legacyVisitor from "./transformer-legacy";

export default declare((api, options) => {
  api.assertVersion(7);

  return {
    name: "typescript-decorators",
    visitor: legacyVisitor,
    manipulateOptions(_0, parserOpts) {
      parserOpts.plugins.push("decorators-legacy");
    }
  };
});
