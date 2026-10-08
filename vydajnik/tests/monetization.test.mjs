import test from "node:test";
import assert from "node:assert/strict";
import { isValidAdsensePublisherId, isValidAdsenseSlotId, mayRequestAds } from "../src/lib/monetization/adsense.ts";

test("AdSense IDs accept only expected production identifier formats", () => {
  assert.equal(isValidAdsensePublisherId("ca-pub-1234567890123456"), true);
  assert.equal(isValidAdsensePublisherId("ca-pub-example"), false);
  assert.equal(isValidAdsenseSlotId("1234567890"), true);
  assert.equal(isValidAdsenseSlotId("demo-slot"), false);
});

test("ad requests fail closed when TCF consent is unavailable or incomplete", () => {
  assert.equal(mayRequestAds({}), false);
  assert.equal(mayRequestAds({ gdprApplies: true, tcString: "test", purpose: { consents: { "1": true, "3": true } }, vendor: { consents: { "755": true } } }), false);
  assert.equal(mayRequestAds({ gdprApplies: true, tcString: "test", purpose: { consents: { "1": true, "3": true, "4": true } }, vendor: { consents: { "755": true } } }), true);
});

test("non-EEA ad request still requires a successful TCF callback at caller", () => {
  assert.equal(mayRequestAds({ gdprApplies: false }), true);
});
