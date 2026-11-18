'use strict';
window.icon = (name, cls = '') => {
  const paths = {
    like: '<path d="M7 10v11H3V10h4Zm0 0 4-8c3 0 3 2 2 6h6a2 2 0 0 1 2 2l-2 9a2 2 0 0 1-2 2H7"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M8 8h8m-4 0v9m-4-5h8"/>',
    star: '<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z"/>',
    pin: '<path d="m8 3 8 0-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v7"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    settings: '<path d="m9 3-.6 2.2-2 .9-2-.6-2 3.5L4 10.7v2.6L2.4 15l2 3.5 2-.6 2 .9L9 21h6l.6-2.2 2-.9 2 .6 2-3.5-1.6-1.7v-2.6L21.6 9l-2-3.5-2 .6-2-.9L15 3Z"/><circle cx="12" cy="12" r="3"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    up: '<path d="m6 13 6-6 6 6M12 7v14M5 3h14"/>',
    chevrons: '<path d="m9 8 3-3 3 3m-6 8 3 3 3-3"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    fire: '<path d="M13 3c1 5-3 5-2 9 3 0 4-2 4-4 4 3 6 6 3 10-2 3-8 4-11 0S5 10 8 8c0 3 1 4 2 4-1-4 2-5 3-9Z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    history: '<path d="M3 11a9 9 0 1 1 2.4 7M3 4v7h7M12 7v5l3 2"/>',
    search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m14 5-7 7 7 7"/>',
    play: '<path d="m8 4 13 8-13 8Z"/>',
    video: '<rect x="3" y="5" width="18" height="15" rx="4"/><path d="m8 1 4 4 4-4M8 11v4M16 11v4"/>',
    refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/>',
    moon: '<path d="M21 13a9 9 0 0 1-10-10A9 9 0 1 0 21 13Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="3"/><path d="M8 22h8m-4-5v5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
    comment: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M7 9h5m3 0h2M7 14h2m3 0h5"/>',
    link: '<path d="M14 3h7v7m-1-6-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>'
  };
  return `<svg class="svg-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.video}</svg>`;
};
