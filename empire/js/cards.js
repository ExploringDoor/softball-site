/* Empire player cards: one 1000x1400 picture drawn on a canvas when someone asks for it. Nothing loops.
   EmpireCards.render({ player, style, stats:[[value,label]], url, scale }) -> Promise<canvas>
   EmpireCards.share(canvas, fileName, text) -> 'shared' | 'downloaded' | 'cancelled' */
(function () {
  'use strict';
  var W = 1000, H = 1400;
  var GOLD = '#e9d5a1', INK = '#0b0b0b';
  var STYLES = {
    pin:   { name: 'Pinstripe', bg: ['#161616', '#050505'], stripe: 'rgba(233,213,161,.17)', border: GOLD, text: '#ffffff', dim: 'rgba(255,255,255,.7)', accent: GOLD, on: INK, tile: 'rgba(255,255,255,.07)', tileLine: 'rgba(233,213,161,.35)', sky: '#0b0b0b' },
    gold:  { name: 'Gold', bg: ['#f3e4bb', '#dcc487'], stripe: 'rgba(0,0,0,.09)', border: INK, text: INK, dim: 'rgba(11,11,11,.68)', accent: INK, on: GOLD, tile: 'rgba(255,255,255,.5)', tileLine: 'rgba(11,11,11,.35)', sky: '#e9d5a1' },
    white: { name: 'Home white', bg: ['#ffffff', '#f3f0e6'], stripe: 'rgba(0,0,0,.13)', border: INK, text: INK, dim: 'rgba(11,11,11,.66)', accent: INK, on: GOLD, tile: '#ffffff', tileLine: 'rgba(11,11,11,.4)', sky: '#fbfaf5' },
    night: { name: 'City night', bg: ['#2b2b2e', '#000000'], stripe: '', border: '#ffffff', text: '#ffffff', dim: 'rgba(255,255,255,.66)', accent: GOLD, on: INK, tile: 'rgba(233,213,161,.1)', tileLine: 'rgba(255,255,255,.25)', sky: '#0a0a0a' }
  };
  var SKY = 'M0 70V52h34V40h22v12h30V30h18v-8h10v8h16v22h40V44h26V34h30v18h28V24h14V12h8V4h4v8h8v12h14v28h36V38h24v14h30V46h22V26h30v20h26V16h10V0h6v16h10v30h34V36h28v16h30V28h20v-8h12v8h20v24h32V42h26v10h30V32h36v20h28V44h30V22h14v-8h8v8h14v30h34V38h30v14h26V48h40v22z';
  var DISP = '"Unbounded"', BODY = '"Instrument Sans"';

  function loadImg(src) { return new Promise(function (res) { if (!src) return res(null); var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function fit(x, text, weight, max, maxW, min, fam) { var s = max; x.font = weight + ' ' + s + 'px ' + (fam || DISP); while (x.measureText(text).width > maxW && s > (min || 24)) { s -= 2; x.font = weight + ' ' + s + 'px ' + (fam || DISP); } return s; }
  function fonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([document.fonts.load('900 80px ' + DISP), document.fonts.load('700 30px ' + DISP), document.fonts.load('600 26px ' + BODY), document.fonts.load('700 26px ' + BODY)]).catch(function () { });
  }

  function render(o) {
    var S = STYLES[o.style] || STYLES.pin, P = o.player || {}, k = o.scale || 1;
    return Promise.all([fonts(), loadImg(P.photo)]).then(function (got) {
      var hs = got[1];
      var c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
      var x = c.getContext('2d'); x.scale(k, k);

      /* body */
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.bg[0]); g.addColorStop(1, S.bg[1]);
      rr(x, 0, 0, W, H, 44); x.fillStyle = g; x.fill();
      x.save(); rr(x, 0, 0, W, H, 44); x.clip();
      if (S.stripe) { x.fillStyle = S.stripe; for (var sx = 30; sx < W; sx += 38) x.fillRect(sx, 0, 3, H); }
      x.restore();
      rr(x, 14, 14, W - 28, H - 28, 34); x.strokeStyle = S.border; x.lineWidth = 12; x.stroke();

      /* photo window with the skyline cut into its bottom edge */
      var px = 58, py = 58, pw = W - 116, ph = 800;
      x.save(); rr(x, px, py, pw, ph, 20); x.clip();
      x.fillStyle = '#d9d4c6'; x.fillRect(px, py, pw, ph);
      if (hs) { var s = Math.max(pw / hs.width, ph / hs.height), dh = hs.height * s; x.drawImage(hs, px - (hs.width * s - pw) / 2, py - (dh - ph) * 0.18, hs.width * s, dh); }
      else { x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '900 220px ' + DISP; x.fillText(String(P.name || '').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(), px + pw / 2, py + ph / 2); }
      var skH = 92; x.save(); x.translate(px, py + ph - skH + 1); x.scale(pw / 1200, skH / 70); x.fillStyle = S.sky; x.fill(new Path2D(SKY)); x.restore();
      x.restore();
      rr(x, px, py, pw, ph, 20); x.strokeStyle = S.border; x.lineWidth = 5; x.stroke();

      /* class tab, top right of the photo */
      x.fillStyle = S.accent; rr(x, px + pw - 214, py + 22, 192, 118, 14); x.fill();
      x.fillStyle = S.on; x.textAlign = 'center'; x.textBaseline = 'top';
      x.font = '700 20px ' + BODY; x.fillText('CLASS OF', px + pw - 118, py + 38);
      x.font = '900 54px ' + DISP; x.fillText(String(P.grad || ''), px + pw - 118, py + 66);
      /* jersey number, top left */
      if (P.num) { x.fillStyle = '#ffffff'; rr(x, px + 22, py + 22, 118, 118, 14); x.fill(); x.strokeStyle = INK; x.lineWidth = 4; x.stroke(); x.fillStyle = INK; x.textBaseline = 'middle'; x.font = '900 ' + (String(P.num).length > 1 ? 54 : 66) + 'px ' + DISP; x.fillText(String(P.num), px + 81, py + 84); }

      /* name */
      var nm = String(P.name || 'Player').split(/\s+/), first = nm[0].toUpperCase(), last = nm.slice(1).join(' ').toUpperCase() || first;
      x.textAlign = 'left'; x.textBaseline = 'top';
      x.fillStyle = S.dim; x.font = '700 34px ' + DISP; if (nm.length > 1) x.fillText(first, 60, 884);
      x.fillStyle = S.text; var ls = fit(x, last, '900', 104, W - 120, 46); x.fillText(last, 58, 926);
      var sub = [(P.pos || []).join(' / '), P.team].filter(Boolean).join('   •   ').toUpperCase();
      x.fillStyle = S.accent === INK ? INK : S.accent; fit(x, sub, '700', 28, W - 120, 18, BODY); x.fillText(sub, 60, 926 + ls + 14);

      /* three number tiles + QR */
      var ty = 1112, th = 150, qrW = 170, gap = 16, hasQr = !!(o.url && window.qrcode);
      var st = (o.stats || []).slice(0, 3), area = W - 120 - (hasQr ? qrW + gap : 0), tw = (area - gap * (st.length - 1)) / Math.max(st.length, 1);
      st.forEach(function (t, i) {
        var cx = 60 + i * (tw + gap);
        rr(x, cx, ty, tw, th, 14); x.fillStyle = S.tile; x.fill(); x.strokeStyle = S.tileLine; x.lineWidth = 2.5; x.stroke();
        x.textAlign = 'center'; x.fillStyle = S.text; fit(x, String(t[0]), '900', 50, tw - 24, 24); x.textBaseline = 'middle'; x.fillText(String(t[0]), cx + tw / 2, ty + 62);
        x.fillStyle = S.dim; x.font = '700 20px ' + BODY; x.fillText(String(t[1]).toUpperCase(), cx + tw / 2, ty + 118);
      });
      if (hasQr) {
        try {
          var q = window.qrcode(0, 'M'); q.addData(o.url); q.make();
          var n = q.getModuleCount(), qx = W - 60 - qrW, pad = 12, cell = (qrW - pad * 2) / n;
          rr(x, qx, ty - 10, qrW, qrW, 12); x.fillStyle = '#ffffff'; x.fill(); x.strokeStyle = INK; x.lineWidth = 3; x.stroke();
          x.fillStyle = INK;
          for (var r = 0; r < n; r++) for (var cc = 0; cc < n; cc++) if (q.isDark(r, cc)) x.fillRect(qx + pad + cc * cell, ty - 10 + pad + r * cell, cell + 0.4, cell + 0.4);
        } catch (e) { }
      }

      /* footer */
      x.textBaseline = 'top'; x.textAlign = 'left';
      x.fillStyle = S.text; x.font = '900 30px ' + DISP; x.fillText('EMPIRE', 60, 1296);
      var ew = x.measureText('EMPIRE').width;
      x.fillStyle = S.dim; x.font = '700 30px ' + DISP; x.fillText('SOFTBALL', 60 + ew + 14, 1296);
      x.textAlign = 'right'; x.font = '600 22px ' + BODY; x.fillStyle = S.dim;
      var foot = hasQr ? 'Scan for her full profile' : (P.school || ''); fit(x, foot, '600', 22, 380, 14, BODY); x.fillText(foot, W - 60, 1302);
      if (!hasQr) return c;
      x.textAlign = 'left'; fit(x, String(P.school || ''), '600', 22, W - 120, 14, BODY); x.fillStyle = S.dim; x.fillText(String(P.school || ''), 60, 1340);
      return c;
    });
  }

  function blobOf(c) { return new Promise(function (res) { c.toBlob(res, 'image/png'); }); }
  function save(blob, fileName) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000); }
  function share(c, fileName, text, downloadOnly) {
    return blobOf(c).then(function (blob) {
      var file = null; try { file = new File([blob], fileName, { type: 'image/png' }); } catch (e) { }
      if (!downloadOnly && file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: text, text: text }).then(function () { return 'shared'; }, function (e) { if (e && e.name === 'AbortError') return 'cancelled'; save(blob, fileName); return 'downloaded'; });
      }
      save(blob, fileName); return 'downloaded';
    });
  }

  window.EmpireCards = { STYLES: STYLES, render: render, share: share, W: W, H: H };
})();
