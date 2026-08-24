import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogPath, ephemeralImageHosts, loadTestImageCatalog, resolveCatalogImage } from "../lib/test-images.mjs";

const catalog = loadTestImageCatalog({ env: {} });

test("素材清单可以加载且没有告警", () => {
  assert.deepEqual(catalog.warnings, []);
  assert.equal(catalog.images.length, 6);
});

test("清单里登记的素材文件都存在且类型受支持", () => {
  for (const image of catalog.images) {
    assert.equal(image.exists, true, `${image.file} 不存在`);
    assert.ok(image.bytes > 0, `${image.file} 大小为 0`);
    assert.match(image.contentType, /^image\/(jpeg|png)$/);
  }
});

test("清单文件里的任何直链都不能指向临时图床", () => {
  const urls = [];
  const walk = node => {
    if (typeof node === "string") { if (/^https?:\/\//i.test(node.trim())) urls.push(node.trim()); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(JSON.parse(readFileSync(catalogPath, "utf8")));
  for (const url of urls) {
    const host = new URL(url).hostname.toLowerCase();
    for (const bad of ephemeralImageHosts) {
      assert.equal(host === bad || host.endsWith(`.${bad}`), false, `素材清单又出现了临时图床直链：${url}`);
    }
  }
});

test("临时图床直链会被拒绝并给出告警", () => {
  const result = loadTestImageCatalog({ env: { DEMO_DEFAULT_IMAGE_URL: "https://h.uguu.se/dSQXxsoM.jpg" } });
  assert.equal(result.defaultSource.publicUrl, null);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /临时图床/);
});

test("DEMO_DEFAULT_IMAGE_URL 可以覆盖默认图片", () => {
  const url = "https://example-bucket.oss-cn-hangzhou.aliyuncs.com/demo/flood.jpg";
  const result = loadTestImageCatalog({ env: { DEMO_DEFAULT_IMAGE_URL: url } });
  assert.equal(result.defaultSource.publicUrl, url);
  assert.equal(result.defaultSource.overridden, true);
  assert.deepEqual(result.warnings, []);
});

test("非 http(s) 的直链会被忽略", () => {
  const result = loadTestImageCatalog({ env: { DEMO_DEFAULT_IMAGE_URL: "file:///C:/secret.jpg" } });
  assert.equal(result.defaultSource.publicUrl, null);
  assert.match(result.warnings[0], /不是 http\(s\) 直链/);
});

test("只允许访问清单内登记的素材名", () => {
  assert.equal(resolveCatalogImage(catalog, "03_flooded_road_high.jpg").file, "03_flooded_road_high.jpg");
  for (const bad of ["", "  ", "nope.jpg", "../package.json", "..\\.env.local", "assets/test-images/03_flooded_road_high.jpg", null, undefined]) {
    assert.equal(resolveCatalogImage(catalog, bad), null, `不应放行 ${JSON.stringify(bad)}`);
  }
});
