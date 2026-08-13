/* ===========================================================
   animate.js
   Small, dependency-free animation helpers shared across
   render.js. Everything here checks prefers-reduced-motion and
   short-circuits to the final state instantly when it's set.
   =========================================================== */

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates a number counting up from 0 (or from the element's current
 * displayed value) to a target, formatting with the given formatter.
 * Safe to call on elements holding "—" or currency strings.
 */
function animateCount(node, targetValue, { duration = 700, prefix = '', suffix = '', decimals = 0 } = {}) {
  if (typeof targetValue !== 'number' || Number.isNaN(targetValue)) {
    node.textContent = targetValue;
    return;
  }
  if (prefersReducedMotion()) {
    node.textContent = `${prefix}${targetValue.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    return;
  }
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    // ease-out-expo
    const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    const current = from + (targetValue - from) * eased;
    node.textContent = `${prefix}${current.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * Grows a bar-fill element's width from 0 to its target percentage,
 * with an optional stagger delay based on index. Relies on the
 * element already having its target width set as a data attribute
 * or passed in directly — this just handles the "animate from 0"
 * transition trick (browsers won't transition a width set in the
 * same paint frame it's created in).
 */
function growBar(fillNode, targetPct, index = 0) {
  if (prefersReducedMotion()) {
    fillNode.style.width = `${targetPct}%`;
    return;
  }
  fillNode.style.width = '0%';
  fillNode.style.transitionDelay = `${Math.min(index * 35, 500)}ms`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fillNode.style.width = `${targetPct}%`;
    });
  });
}

function growCurveBar(barNode, targetPct, index = 0) {
  if (prefersReducedMotion()) {
    barNode.style.height = `${targetPct}%`;
    return;
  }
  barNode.style.height = '0%';
  barNode.style.transitionDelay = `${Math.min(index * 45, 400)}ms`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      barNode.style.height = `${targetPct}%`;
    });
  });
}

/**
 * Applies a staggered fade/rise-in to a NodeList or array of elements
 * by toggling a class that CSS animates, with incrementing delays.
 */
function staggerIn(elements, { className = 'stagger-in', step = 30, cap = 400 } = {}) {
  if (prefersReducedMotion()) {
    elements.forEach(node => node.classList.add(className));
    return;
  }
  elements.forEach((node, i) => {
    node.style.animationDelay = `${Math.min(i * step, cap)}ms`;
    node.classList.add(className);
  });
}

/**
 * Smoothly swaps visibility between two elements that use the `hidden`
 * attribute — fades the outgoing one out, then un-hides the incoming one
 * and fades it in, rather than an abrupt display:none/block jump cut.
 */
function crossFade(hideEl, showEl) {
  if (prefersReducedMotion() || !hideEl) {
    if (hideEl) hideEl.hidden = true;
    showEl.hidden = false;
    return;
  }
  hideEl.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
  hideEl.style.opacity = '0';
  hideEl.style.transform = 'translateY(-6px)';
  setTimeout(() => {
    hideEl.hidden = true;
    hideEl.style.opacity = '';
    hideEl.style.transform = '';
    showEl.hidden = false;
    showEl.style.opacity = '0';
    showEl.style.transform = 'translateY(10px)';
    showEl.style.transition = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        showEl.style.transition = 'opacity 0.32s cubic-bezier(0.16,1,0.3,1), transform 0.32s cubic-bezier(0.16,1,0.3,1)';
        showEl.style.opacity = '1';
        showEl.style.transform = 'translateY(0)';
      });
    });
  }, 180);
}
