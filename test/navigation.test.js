'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HOME, isBiliURL, resolveInput, videoId, imageURL, normalizeVideo } = require('../src/navigation');

test('allows Bilibili pages and short links over HTTPS', () => {
  for (const url of [HOME, 'https://passport.bilibili.com/login', 'https://b23.tv/abc']) assert.equal(isBiliURL(url), true);
});
test('rejects spoofed hosts, local files, script schemes and credentials', () => {
  for (const url of ['https://bilibili.com.evil.example/', 'https://evilbilibili.com', 'file:///C:/Windows/', 'javascript:alert(1)', 'http://www.bilibili.com', 'https://user:password@www.bilibili.com/', 'https://www.bilibili.com:9999/']) assert.equal(isBiliURL(url), false, url);
});
test('resolves trusted links and encodes arbitrary searches', () => {
  assert.equal(resolveInput(''), HOME);
  assert.equal(resolveInput('www.bilibili.com/video/BV123'), 'https://www.bilibili.com/video/BV123');
  assert.equal(resolveInput('猫 & 狗'), 'https://search.bilibili.com/all?keyword=%E7%8C%AB%20%26%20%E7%8B%97');
  assert.match(resolveInput('https://evil.example'), /^https:\/\/search\.bilibili\.com\//);
});
test('only extracts video identifiers from plain IDs and trusted links', () => {
  assert.equal(videoId('BV14uWC6bEz2'), 'BV14uWC6bEz2');
  assert.equal(videoId('https://www.bilibili.com/video/BV14uWC6bEz2/?p=2'), 'BV14uWC6bEz2');
  for (const value of ['https://evil.example/video/BV14uWC6bEz2/', 'BV../file', 'BV123', null]) assert.equal(videoId(value), '');
});
test('image proxy restricts destinations to trusted HTTPS CDNs', () => {
  assert.equal(imageURL('//i0.hdslb.com/bfs/a.jpg'), 'https://i0.hdslb.com/bfs/a.jpg');
  assert.equal(imageURL('http://i0.hdslb.com/bfs/a.jpg'), 'https://i0.hdslb.com/bfs/a.jpg');
  for (const value of ['https://localhost/', 'file:///etc/passwd', 'https://hdslb.com.evil.example/', 'https://user@i0.hdslb.com/', 'https://i0.hdslb.com:9999/']) assert.equal(imageURL(value), '');
});
test('normalizes both feed and search data without remote markup', () => {
  const v = normalizeVideo({ bvid: 'BV14uWC6bEz2', title: '<em>Unity</em> &amp; music', author: 'Artist', play: 123, duration: '4:10', pic: '//i0.hdslb.com/a.jpg' });
  assert.equal(v.title, 'Unity & music');
  assert.equal(v.views, 123);
  assert.equal(v.author, 'Artist');
  assert.equal(v.duration, '4:10');
});
