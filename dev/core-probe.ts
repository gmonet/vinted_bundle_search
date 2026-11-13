// Exposes the core engine on window for manual/automated probing inside a real Vinted page.
import { VintedClient } from '../src/core/api';
import { runSearch } from '../src/core/engine';
import { newQuery, newSearch } from '../src/core/types';

(window as unknown as Record<string, unknown>).__vbsCore = {
  VintedClient,
  runSearch,
  newQuery,
  newSearch,
};
