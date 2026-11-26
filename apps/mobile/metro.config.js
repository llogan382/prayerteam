// Expo configures Metro for monorepos automatically (SDK 52+); no overrides.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
