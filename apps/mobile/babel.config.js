/** @type {import('react-native-unistyles/plugin').UnistylesPluginOptions} */
const unistyles = { root: 'src' };

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Unistyles must run before the React Compiler that babel-preset-expo adds.
    plugins: [['react-native-unistyles/plugin', unistyles]],
  };
};
