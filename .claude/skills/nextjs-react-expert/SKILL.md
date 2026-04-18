---
name: nextjs-react-expert
description: React e Next.js performance optimization da Vercel Engineering. 57 regras priorizadas por impacto. Usar ao construir componentes, otimizar performance, eliminar waterfalls, reduzir bundle size ou revisar código.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Next.js & React Performance Expert

> **From Vercel Engineering** — 57 optimization rules prioritized by impact
> **Philosophy:** Eliminate waterfalls first, optimize bundles second, then micro-optimize.

---

## 🎯 Selective Reading Rule (MANDATORY)

**Read ONLY sections relevant to your task!** Check the content map below and load what you need.

> 🔴 **For performance reviews: Start with CRITICAL sections (1-2), then move to HIGH/MEDIUM.**

---

## 📑 Content Map

| Impact | Rules | When to Read |
|--------|-------|--------------|
| 🔴 **CRITICAL** — Eliminating Waterfalls | 5 | Slow page loads, sequential API calls, data fetching waterfalls |
| 🔴 **CRITICAL** — Bundle Size Optimization | 5 | Large bundle size, slow TTI, First Load issues |
| 🟠 **HIGH** — Server-Side Performance | 7 | Slow SSR, API route optimization, server-side waterfalls |
| 🟡 **MEDIUM** — Client-Side Data Fetching | 4 | Client data management, SWR patterns, deduplication |
| 🟡 **MEDIUM** — Re-render Optimization | 12 | Excessive re-renders, React performance, memoization |
| 🟡 **MEDIUM** — Rendering Performance | 9 | Rendering bottlenecks, virtualization, image optimization |
| ⚪ **LOW** — JavaScript Performance | 12 | Micro-optimizations, caching, loop performance |
| 🔵 **VARIABLE** — Advanced Patterns | 3 | useLatest hook, init-once patterns |
| 🔴 **CRITICAL** — Cache Components (Next.js 16+) | 4 | `use cache`, `cacheLife`, PPR, `cacheTag` |

**Total: 57 rules across 9 categories**

---

## 🚀 Quick Decision Tree

```
Slow page loads       → Waterfalls + Bundle Size
Large bundle (>200KB) → Bundle Size + Dynamic imports
Slow SSR              → Server-Side Performance
Too many re-renders   → Re-render Optimization
Client data issues    → Client-Side Data Fetching
Next.js 16+           → Cache Components (use cache / PPR)
```

---

## ✅ Performance Review Checklist

**Critical (Must Fix):**
- [ ] No sequential data fetching (waterfalls eliminated)
- [ ] Bundle size < 200KB for main bundle
- [ ] No barrel imports in app code
- [ ] Dynamic imports used for large components
- [ ] Parallel data fetching where possible

**High Priority:**
- [ ] Server components used where appropriate
- [ ] API routes optimized (no N+1 queries)
- [ ] Suspense boundaries for data fetching

**Medium Priority:**
- [ ] Expensive computations memoized
- [ ] List rendering virtualized (if > 100 items)
- [ ] Images optimized with next/image

---

## ❌ Anti-Patterns

**DON'T:**
- ❌ Sequential `await` for independent operations
- ❌ Import entire libraries when you need one function
- ❌ Barrel exports (`index.ts` re-exports) in app code
- ❌ Skip dynamic imports for large components
- ❌ Fetch data in useEffect without deduplication
- ❌ Use client components when server components work

**DO:**
- ✅ `Promise.all()` for parallel fetching
- ✅ `const Comp = dynamic(() => import('./Heavy'))`
- ✅ Import directly: `import { specific } from 'library/specific'`
- ✅ React Server Components by default
- ✅ `use cache` para rotas Next.js 16+

---

## 🔑 Golden Rules

1. **Measure first** — React DevTools Profiler, Chrome DevTools
2. **Biggest impact first** — Waterfalls → Bundle → Server → Micro
3. **Don't over-optimize** — focus on real bottlenecks
4. **Use platform features** — Next.js has optimizations built-in

---

**Source:** Vercel Engineering | **Version:** 1.0.0 | **Date:** Jan 2026
