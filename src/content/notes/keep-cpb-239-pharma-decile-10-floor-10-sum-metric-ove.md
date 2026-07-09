---
title: "Pharma Decile = 10 - FLOOR(10* (sum(<metric>) over (order by <metric> DESC ROWS BETWE…"
date: 2026-05-13T13:59:16.658Z
tags: ["commonplace"]
draft: true
source: keep
---

Pharma Decile = 10 - FLOOR(10* (sum(<metric>) over (order by <metric> DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / sum(<metric>) over ()) )
