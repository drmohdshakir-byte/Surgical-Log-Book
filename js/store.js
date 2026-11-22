/*
 * Surgical Log Book — local persistence (IndexedDB, localStorage fallback).
 * Data never leaves this browser unless you export it.
 */
(function (root) {
  'use strict';
  var DB_NAME = 'surgical-log-book', DB_VER = 1, STORE = 'entries', LS_KEY = 'slb.entries', SETTINGS_KEY = 'slb.settings';
  var db = null, useLS = false, cache = [];

  function open() {
    return new Promise(function (resolve) {
      if (!root.indexedDB) { useLS = true; return resolve(); }
      var req;
      try { req = root.indexedDB.open(DB_NAME, DB_VER); } catch (e) { useLS = true; return resolve(); }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) { var s = d.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('date', 'date'); }
      };
      req.onsuccess = function () { db = req.result; resolve(); };
      req.onerror = function () { useLS = true; resolve(); };
    });
  }

  function tx(mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function done(req) { return new Promise(function (res, rej) { req.onsuccess = function () { res(req.result); }; req.onerror = function () { rej(req.error); }; }); }
  function lsWrite() { root.localStorage.setItem(LS_KEY, JSON.stringify(cache)); }

  function sortCache() { cache.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1); }); }

  function load() {
    return open().then(function () {
      if (useLS) { try { cache = JSON.parse(root.localStorage.getItem(LS_KEY) || '[]'); } catch (e) { cache = []; } sortCache(); return cache; }
      return done(tx('readonly').getAll()).then(function (all) { cache = all || []; sortCache(); return cache; });
    });
  }

  function all() { return cache; }
  function get(id) { for (var i = 0; i < cache.length; i++) if (cache[i].id === id) return cache[i]; return null; }

  function putMany(entries) {
    entries.forEach(function (e) {
      var i = cache.findIndex(function (c) { return c.id === e.id; });
      if (i >= 0) cache[i] = e; else cache.push(e);
    });
    sortCache();
    if (useLS) { lsWrite(); return Promise.resolve(); }
    return new Promise(function (res, rej) {
      var t = db.transaction(STORE, 'readwrite'), s = t.objectStore(STORE);
      entries.forEach(function (e) { s.put(e); });
      t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); };
    });
  }
  function put(e) { return putMany([e]); }

  function remove(id) {
    cache = cache.filter(function (c) { return c.id !== id; });
    if (useLS) { lsWrite(); return Promise.resolve(); }
    return done(tx('readwrite').delete(id));
  }

  function clear() {
    cache = [];
    if (useLS) { lsWrite(); return Promise.resolve(); }
    return done(tx('readwrite').clear());
  }

  function getSettings() { try { return JSON.parse(root.localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveSettings(s) { try { root.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ } }

  function requestPersistence() {
    if (root.navigator && navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; });
    return Promise.resolve(false);
  }

  root.SLB = root.SLB || {};
  root.SLB.store = { load: load, all: all, get: get, put: put, putMany: putMany, remove: remove, clear: clear,
    getSettings: getSettings, saveSettings: saveSettings, requestPersistence: requestPersistence,
    backend: function () { return useLS ? 'localStorage' : 'IndexedDB'; } };
})(typeof window !== 'undefined' ? window : globalThis);
