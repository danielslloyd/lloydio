---
title: "There is still only one test"
url: "https://allendowney.blogspot.com/2016/06/there-is-still-only-one-test.html"
author: "Allen Downey"
source: "Probably Overthinking It"
published: "2016-06-07"
date: 2026-10-21T19:54:54.000Z
status: ready
---

# There is still only one test

In 2011 I wrote an article called "There is Only One Test", where I explained that all hypothesis tests are based on the same framework, which looks like this:

Here are the elements of this framework:

1) Given a dataset, you compute a test statistic that measures the size of the apparent effect. For example, if you are describing a difference between two groups, the test statistic might be the absolute difference in means. I'll call the test statistic from the observed data 𝛿*.

2) Next, you define a null hypothesis, which is a model of the world under the assumption that the effect is not real; for example, if you think there might be a difference between two groups, the null hypothesis would assume that there is no difference.

3) Your model of the null hypothesis should be stochastic; that is, capable of generating random datasets similar to the original dataset.

4) Now, the goal of classical hypothesis testing is to compute a p-value, which is the probability of seeing an effect as big as 𝛿* under the null hypothesis. You can estimate the p-value by using your model of the null hypothesis to generate many simulated datasets. For each simulated dataset, compute the same test statistic you used on the actual data.

5) Finally, count the fraction of times the test statistic from simulated data exceeds 𝛿*. This fraction approximates the p-value. If it's sufficiently small, you can conclude that the apparent effect is unlikely to be due to chance (if you don't believe that sentence, please read this).

That's it. All hypothesis tests fit into this framework. The reason there are so many names for so many supposedly different tests is that each name corresponds to

1) A test statistic,

2) A model of a null hypothesis, and usually,

3) An analytic method that computes or approximates the p-value.

These analytic methods were necessary when computation was slow and expensive, but as computation gets cheaper and faster, they are less appealing because:

1) They are inflexible: If you use a standard test you are committed to using a particular test statistic and a particular model of the null hypothesis. You might have to use a test statistic that is not appropriate for your problem domain, only because it lends itself to analysis. And if the problem you are trying to solve doesn't fit an off-the-shelf model, you are out of luck.

2) They are opaque: The null hypothesis is a model, which means it is a simplification of the world. For any real-world scenario, there are many possible models, based on different assumptions. In most standard tests, these assumptions are implicit, and it is not easy to know whether a model is appropriate for a particular scenario.

One of the most important advantages of simulation methods is that they make the model explicit. When you create a simulation, you are forced to think about your modeling decisions, and the simulations themselves document those decisions.

And simulations are almost arbitrarily flexible. It is easy to try out several test statistics and several models, so you can choose the ones most appropriate for the scenario. And if different models yield very different results, that's a useful warning that the results are open to interpretation. (Here's an example I wrote about in 2011.)

## More resources

A few days ago, I saw this discussion on Reddit. In response to the question "Looking back on what you know so far, what statistical concept took you a surprising amount of effort to understand?", one redditor wrote

The general logic behind statistical tests and null hypothesis testing took quite some time for me. I was doing t-tests and the like in both work and classes at that time, but the overall picture evaded me for some reason.

I remember the exact time where everything started clicking - that was after I found a blog post (cannot find it now) called something like "There is only one statistical test". And it explained the general logic of testing something and tied it down to permutations. All of that seemed very natural.

I am pretty sure they were talking about my article. How nice! In response, I provided links to some additional resources; and I'll post them here, too.

First, I wrote a followup to my original article, called "More hypotheses, less trivia", where I provided more concrete examples using the simulation framework.

Later in 2011 I did a webcast with O'Reilly Media where I explained the whole idea:

In 2015 I developed a workshop called "Computational Statistics", where I present this framework along with a similar computational framework for computing confidence intervals. The slides and other materials from the workshop are here.

And I am not alone! In 2014, John Rauser presented a keynote address at Strata+Hadoop, with the excellent title "Statistics Without the Agonizing Pain":

And for several years, Jake VanderPlas has been banging a similar drum, most recently in an excellent talk at PyCon 2016:

UPDATE: John Rauser pointed me to this excellent article, "The Introductory Statistics Course: A Ptolemaic Curriculum" by George W. Cobb.

UPDATE: Andrew Bray has developed an R package called "infer" to do computational statistical inference. Here's an excellent talk where he explains it.
