"""Collapse the September baseline study by default.

The baseline (the audit verdicts near the top, and sections 01 to 06 at the
bottom) is a fixed reference from September 2026 and is not refreshed each
month. Both parts sit in <details> blocks that start closed. Links into a
closed block open it. Idempotent: running twice changes nothing.
"""
MARK = 'class="baseline-fold"'
TOP_SUM = ('<summary><span class="eyebrow">Baseline study · September 2026</span>'
           '<span class="bf-title">How ATM compared with benchmarks and peers in September</span>'
           '<span class="bf-note">A fixed reference point, not refreshed each month. Open to read the verdicts.</span></summary>')
BOT_SUM = ('<summary><span class="eyebrow">Baseline detail · September 2026</span>'
           '<span class="bf-title">Sections 01 to 06: the evidence behind the September verdicts</span>'
           '<span class="bf-note">A fixed reference point, not refreshed each month. Open to read.</span></summary>')
CSS = ('<style id="baseline-fold-css">'
       '.baseline-fold>summary{cursor:pointer;list-style:none;padding:14px 0;display:grid;gap:4px}'
       '.baseline-fold>summary::-webkit-details-marker{display:none}'
       '.baseline-fold>summary .bf-title{font-weight:700;font-size:17px}'
       '.baseline-fold>summary .bf-title::before{content:"\\25B8  "}'
       '.baseline-fold[open]>summary .bf-title::before{content:"\\25BE  "}'
       '.baseline-fold>summary .bf-note{font-size:13.5px;opacity:.75}'
       '</style>')
JS = ('<script id="baseline-fold-js">(function(){function openFor(h){if(!h||h.length<2)return;'
      'var t=document.getElementById(h.slice(1));if(!t)return;var d=t.closest(".baseline-fold")||t.querySelector(":scope>.baseline-fold");'
      'if(d&&!d.open){d.open=true;setTimeout(function(){t.scrollIntoView();},0);}}'
      'document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href^=\'#\']");if(a)openFor(a.getAttribute("href"));});'
      'window.addEventListener("hashchange",function(){openFor(location.hash);});'
      'if(location.hash)window.addEventListener("load",function(){openFor(location.hash);});})();</script>')

def fold(html):
    if MARK in html:
        return html
    a0 = '<section data-sec="audit" id="audit">'
    a1 = '</section><section data-added="" id="glance">'
    i = html.index(a0) + len(a0); j = html.index(a1, i)
    html = html[:i] + '<details ' + MARK + ' id="baseline-top">' + TOP_SUM + html[i:j] + '</details>' + html[j:]
    b0 = '<!-- 1. Scorecard -->'
    b1 = '<!-- 8. Data connections -->'
    i = html.index(b0); j = html.index(b1, i)
    html = html[:i] + '<details ' + MARK + ' id="baseline-detail">' + BOT_SUM + html[i:j] + '</details>\n' + html[j:]
    html = html.replace('further down the page.</p>', 'further down the page, under "Baseline detail".</p>', 1)
    html = html.replace('The detail behind them is at the bottom of the page (sections 01 to 06).',
                        'Collapsed by default: a fixed reference from September, not refreshed each month. The detail behind them is at the bottom of the page (sections 01 to 06), also collapsed.', 1)
    html = html.replace('</head>', CSS + '</head>', 1)
    k = html.rfind('</body>')
    return html + JS if k < 0 else html[:k] + JS + html[k:]

if __name__ == "__main__":
    import sys
    p = sys.argv[1] if len(sys.argv) > 1 else "index.html"
    s = fold(open(p, encoding="utf-8").read())
    open(p, "w", encoding="utf-8").write(s)
