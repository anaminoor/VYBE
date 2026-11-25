// api.js - one function per Java API route.
// Every function returns a Promise with the JSON the Java server sends back.
// If Java answers with an error, the Promise rejects with that error message
// (and, for the song form, error.fields holds one message per field).

const Api = {
  async request(method, route, params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, value);
    }
    const url = '/api/' + route + (query.toString() ? '?' + query : '');

    let response;
    try {
      response = await fetch(url, { method });
    } catch (e) {
      throw new Error('Cannot reach the Java server. Is it running?');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Request failed (' + response.status + ')');
      error.fields = data.fields || null;
      throw error;
    }
    Art.collect(data);                 // remember which songs have a real cover image
    return data;
  },

  // Reading
  playlists()            { return Api.request('GET', 'playlists'); },
  playlist(id, q)        { return Api.request('GET', 'playlist', { id, q }); },
  recent(q)              { return Api.request('GET', 'recent', { q }); },
  player()               { return Api.request('GET', 'player'); },
  home()                 { return Api.request('GET', 'home'); },
  stats()                { return Api.request('GET', 'stats'); },
  artist(name)           { return Api.request('GET', 'artist', { name }); },
  album(name, artist)    { return Api.request('GET', 'album', { name, artist }); },
  searchAll(q)           { return Api.request('GET', 'search-all', { q }); },
  lyrics(songId)         { return Api.request('GET', 'lyrics', { songId }); },
  queue()                { return Api.request('GET', 'queue'); },

  // Playlists
  createPlaylist(name)   { return Api.request('POST', 'playlist/create', { name }); },
  renamePlaylist(id, name) { return Api.request('POST', 'playlist/rename', { id, name }); },
  deletePlaylist(id)     { return Api.request('POST', 'playlist/delete', { id }); },
  cover(id, gradient, emoji) { return Api.request('POST', 'playlist/cover', { id, gradient, emoji }); },
  addSong(id, songId)    { return Api.request('POST', 'playlist/add', { id, songId }); },
  removeSong(id, songId) { return Api.request('POST', 'playlist/remove', { id, songId }); },
  move(id, songId, to)   { return Api.request('POST', 'playlist/move', { id, songId, to }); },
  shuffle(id)            { return Api.request('POST', 'playlist/shuffle', { id }); },
  sort(id, field, order) { return Api.request('POST', 'playlist/sort', { id, field, order }); },

  // Several songs at once
  batchAdd(id, songIds)  { return Api.request('POST', 'batch/add', { id, songIds: songIds.join(',') }); },
  batchRemove(id, songIds) { return Api.request('POST', 'batch/remove', { id, songIds: songIds.join(',') }); },
  batchLike(songIds, liked) { return Api.request('POST', 'batch/like', { songIds: songIds.join(','), liked: liked ? 'true' : 'false' }); },

  // Player
  play(playlistId, songId) { return Api.request('POST', 'player/play', { playlistId, songId }); },
  playContext(type, key, artist, songId, shuffle) {
    return Api.request('POST', 'player/play-context', { type, key, artist, songId, shuffle: shuffle ? 'true' : '' });
  },
  next(auto)             { return Api.request('POST', 'player/next', { auto: auto ? 'true' : 'false' }); },
  previous()             { return Api.request('POST', 'player/previous'); },
  repeat(mode)           { return Api.request('POST', 'player/repeat', { mode }); },

  // "Play next" queue
  queueAdd(songIds)      { return Api.request('POST', 'queue/add', { songIds: songIds.join(',') }); },
  queueRemove(index)     { return Api.request('POST', 'queue/remove', { index }); },
  queuePlay(index)       { return Api.request('POST', 'queue/play', { index }); },
  queueClear()           { return Api.request('POST', 'queue/clear'); },

  // Songs
  like(songId)           { return Api.request('POST', 'like', { songId }); },
  createSong(fields)     { return Api.request('POST', 'song/create', fields); },
  setDuration(id, seconds) { return Api.request('POST', 'song/duration', { id, seconds }); },
  updateSong(id, fields) { return Api.request('POST', 'song/update', { id, ...fields }); },
};

// Small settings kept in the browser (theme, accent, volume, speed).
// Storage can be blocked, so every read and write is guarded.
const Store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* still works for this visit */ }
  },
};
