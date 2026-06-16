import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDataUrl } from '../dataurl-to-png.mjs';

// Real 16x16 RGB PNG. Generated deterministically with node:zlib (no deps).
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAACbElEQVR4nB2Sv2rVQRCFR83/XJMhRLmacJngBUNIYAyiKS64WoRASBghRUiaQS0ihDBNIDZhEcFGyFYWYrGNoN0WwXpBH2DxCdY32EeQn/0wnPOdDwAAAQiAARyAACiAAXiAABABEkAGKAAVoMH/c8QbhDcZbzkcExxXnDCc9DgVcDriTMLZjL2CtyvONZzvniPdJBpjmnA0JTSj1DOa84SBFiItJrqbqV/ofqXlRoMuCvIt4gnmacc94XnlBeM7nvuBlyIPEq9kHhZ+WHmt8UYXHN0YuSl2PedQ3KK6vrll7yi4YXSrya1nx8U9rm6ruVFXE2WcZIZl3smiyD2VgckDL6tBNqJsJnmaZVTkeZXtJrsdFNQJ0h7rgtO+6EB1aLrmlYM+iTpK+iLrTtH9qgdNjzqEaJNkc2x3nC2LPVBbM3vkbSvYs2jbyfayHRQ7rvaq2dsOOPop8si+7zyJX1XP5re8d8HvRC/JH2avxZ9Ub81fdPNgmKawwGHJhaGEDQ1PLDzzYSeElzEcpfA6h9MSzmu4bOFjNybGGYqLHAcurkrc1DiyuO2jhHgU45sUz3K8KPF9jZ9a/NxNj2mW0l1OKy6tS3qq6YWlPZ8OQ3od01lK73L6UNJVTV9a+taJgrlHuc956DJLHmnesXzgs4Z8GvNFyh9yDiV/rfl7y9edVlhuU7nP5aErj6U817Jv5diXk1DOY3mfylUuX0v5UcvPVn51EmKdo7rMdc3VLanbWg+svvLVQr2M9VOqX3L9XurPWn+3+qdTFts8tQG3DddG0na1HVl769tFaB9j+5zat9yuS/tV25/W/v4DifAoUF1PpWgAAAAASUVORK5CYII=';

test('decodes plain base64 (no prefix) to valid PNG', () => {
  const buf = decodeDataUrl(PNG_B64);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
  assert.ok(buf.length > 100);
});

test('decodes data: URL prefix', () => {
  const buf = decodeDataUrl('data:image/png;base64,' + PNG_B64);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
});

test('strips surrounding double quotes', () => {
  const buf = decodeDataUrl('"data:image/png;base64,' + PNG_B64 + '"');
  assert.equal(buf[0], 0x89);
});

test('strips whitespace + quotes + prefix together', () => {
  const buf = decodeDataUrl('  \n"data:image/jpeg;base64,' + PNG_B64 + '"\n ');
  assert.equal(buf[0], 0x89);
});

test('rejects garbage / too-short input', () => {
  assert.throws(() => decodeDataUrl('not-a-png'), /not a valid PNG/);
  assert.throws(() => decodeDataUrl(''), /not a valid PNG/);
});

test('rejects valid-magic-but-truncated buffer (anti-garbage floor)', () => {
  const tiny = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).toString('base64');
  assert.throws(() => decodeDataUrl(tiny), /not a valid PNG/);
});

test('rejects non-string input', () => {
  assert.throws(() => decodeDataUrl(null), /must be a string/);
  assert.throws(() => decodeDataUrl(123), /must be a string/);
});
