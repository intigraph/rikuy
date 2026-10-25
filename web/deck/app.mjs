import {config} from './config.mjs';
import {mount} from './view.mjs';
// No production adapter is selected by this source preview.
mount(document.querySelector('main'), config).catch(() => {
  document.querySelector('main').textContent = 'UNKNOWN · admitted adapters unavailable.';
});
