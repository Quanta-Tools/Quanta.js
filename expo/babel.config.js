export default function (api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Add any plugins you need
    ],
  };
}
