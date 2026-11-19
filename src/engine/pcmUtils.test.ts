import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToInt16,
  calculateRmsLevel,
  downsampleFloat32,
  float32ToInt16,
  int16ToBase64,
  int16ToFloat32,
} from './pcmUtils';

test('float32ToInt16 and int16ToFloat32 round-trip within 16-bit quantization', () => {
  const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const int16 = float32ToInt16(input);
  assert.equal(int16[0], 0);
  assert.equal(int16[3], 32767);
  assert.equal(int16[4], -32768);

  const output = int16ToFloat32(int16);
  for (let i = 0; i < input.length; i += 1) {
    assert.ok(Math.abs(output[i] - input[i]) < 0.001);
  }
});

test('int16ToBase64 and base64ToInt16 preserve exact samples', () => {
  const pcm = new Int16Array([0, 1200, -4500, 32767, -32768]);
  const b64 = int16ToBase64(pcm);
  const decoded = base64ToInt16(b64);
  assert.deepEqual(Array.from(decoded), Array.from(pcm));
});

test('downsampleFloat32 reduces 48kHz to 16kHz by 3x ratio', () => {
  const input = new Float32Array(480);
  input.fill(0.25);
  const down = downsampleFloat32(input, 48000, 16000);
  assert.equal(down.length, 160);
  assert.ok(Math.abs(down[0] - 0.25) < 0.0001);
});

test('calculateRmsLevel computes bounded signal energy', () => {
  assert.equal(calculateRmsLevel(new Float32Array(0)), 0);
  assert.equal(calculateRmsLevel(new Float32Array([0, 0, 0])), 0);
  assert.ok(Math.abs(calculateRmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5])) - 0.5) < 0.0001);
});
