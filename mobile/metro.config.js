// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// Shared pure financial core lives in the parent project; resolve React from mobile first.
const path = require('path');
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../node_modules')];

module.exports = withNativeWind(config, { input: './global.css' });
