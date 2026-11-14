import manifest from './assets.json';
export const asset = (name: keyof typeof manifest) => manifest[name].path;
export type AssetName = keyof typeof manifest;
