# @babel/plugin-proposal-decorators

> Compatible typescript decorators (with parameter decorators).

## Install

Using npm:

```sh
npm install --save-dev babel-plugin-typescript-decorators
```

or using yarn:

```sh
yarn add --dev babel-plugin-typescript-decorators
```

## Usage

### With a configuration file (Recommended)

```json
{
  "presets": [
    ["@babel/preset-typescript", { "onlyRemoveTypeImports": true }]
  ],
  "plugins": ["babel-plugin-typescript-decorators"]
}
```

### Via CLI

```sh
babel --plugins babel-plugin-typescript-decorators script.js
```

### Via Node API

```js
require("@babel/core").transformSync("code", {
  plugins: ["babel-plugin-typescript-decorators"]"],
});
```

## Thanks

Fork from [@babel/plugin-proposal-decorators](https://github.com/babel/babel/tree/main/packages/babel-plugin-proposal-decorators) and inspired by [babel-plugin-parameter-decorator](https://github.com/WarnerHooh/babel-plugin-parameter-decorator)
