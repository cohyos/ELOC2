export {
  loadTile,
  getElevation,
  isLoaded,
  tileCount,
  tileName,
  injectTile,
  clearTiles,
} from './dem-loader.js';

export {
  checkLineOfSight,
  type LosResult,
  type Position3D as TerrainPosition3D,
} from './los-checker.js';
