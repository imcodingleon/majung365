// NativeWind 4: babel-preset-expo에 jsxImportSource 주입 + nativewind/babel 프리셋.
// 워클릿(reanimated) 플러그인은 babel-preset-expo가 자동 포함한다.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
