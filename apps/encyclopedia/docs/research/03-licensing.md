# What the licences require of Encyclopedia

**Question** ([issue #51](https://github.com/christiannaths/homelab/issues/51)): Encyclopedia is a read-only Wikipedia reader built from Kiwix ZIM files. What does each licence in play require of it, and what does each rule out? The licences are GPL for the ZIM/Kiwix code, CC BY-SA 4.0 and GFDL for Wikipedia text, per-file licences for images, and the Wikimedia Foundation trademark policy.

Researched 2026-10-18. This is not legal advice. Judgement calls are marked **Judgement**.

**How the sources were read.** Licence files, READMEs and source code were read directly from each project's repository. The CC BY-SA 4.0 legal code came from Creative Commons' own `cc-legal-tools-data` repository, which is the source of creativecommons.org. This session's network blocked gnu.org, creativecommons.org and every Wikimedia site. The GPL FAQ and the Wikimedia pages (Terms of Use, trademark policy, en.wikipedia reuse pages) were therefore checked only through search-engine excerpts of those pages. Those claims are marked _(excerpt)_ and should be re-read on the live page before anyone relies on the exact wording.

## 1. The code: GPL

### Which licence each piece is under

| Piece | Licence | Source |
| --- | --- | --- |
| `@openzim/libzim` (Node binding, npm 4.7.0) | GPLv3 or later | [README](https://github.com/openzim/node-libzim/blob/main/README.md), [LICENSE](https://github.com/openzim/node-libzim/blob/main/LICENSE), npm `license: GPL-3.0` |
| libzim (C++ library the binding loads) | GPLv2 or later | [README](https://github.com/openzim/libzim/blob/main/README.md) |
| libkiwix (Kiwix core, including the HTTP server code) | GPLv3 or later | [README](https://github.com/kiwix/libkiwix/blob/main/README.md) |
| kiwix-tools (`kiwix-serve`, "HTTP daemon serving ZIM files") | GPLv3 or later | [README](https://github.com/kiwix/kiwix-tools/blob/main/README.md) |
| kiwix-js (browser reader, extension and PWA) | GPLv3 or later | [`www/js/app.js` header](https://github.com/kiwix/kiwix-js/blob/main/www/js/app.js), [LICENSE-GPLv3.txt](https://github.com/kiwix/kiwix-js/blob/main/LICENSE-GPLv3.txt) |
| mwoffliner (the tool that builds Wikipedia ZIMs) | GPLv3 or later | [README](https://github.com/openzim/mwoffliner/blob/main/README.md) |

On GNU/Linux and macOS, `@openzim/libzim` downloads a prebuilt libzim binary at install time. On other systems, libzim has to be installed separately ([README](https://github.com/openzim/node-libzim/blob/main/README.md)). Because libzim is "GPLv2 or later", it can be combined with GPLv3 code by taking it under v3.

The ZIM files themselves are data, not code. The GPL on mwoffliner does not pass to the ZIMs it produces. **Judgement:** this is standard practice for a tool's output, and none of the Kiwix sources say otherwise.

### What the GPLv3 text says

Quotations are from the GPLv3 text in [node-libzim's LICENSE](https://github.com/openzim/node-libzim/blob/main/LICENSE).

- **Duties start when you convey.** "To 'convey' a work means any kind of propagation that enables other parties to make or receive copies" (§0). "Mere interaction with a user through a computer network, with no transfer of a copy, is not conveying" (§0). Running GPL code privately, or on a server that people use over a network, triggers nothing. Unlike the AGPL, GPLv3 has no network-use clause; its §13 only covers combining with AGPL code.
- **Corresponding Source includes** "the source code for shared libraries and dynamically linked subprograms that the work is specifically designed to require" (§1). Dynamic linking is not a way around the licence.
- **Aggregates are exempt.** "Inclusion of a covered work in an aggregate does not cause this License to apply to the other parts of the aggregate" (§5).

### What the GPL FAQ adds _(excerpt)_

The source is the [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html).

- **Linking.** Linking a GPL work "statically or dynamically with other modules is making a combined work based on" it, and the GPL then covers the whole combination (#GPLStaticVsDynamic). Asked whether software that uses a GPL library must also be GPL, the FAQ answers "Yes, because the program as it is actually run includes the library" (#IfLibraryIsGPL).
- **Separate programs.** Where the line falls "is a legal question, which ultimately judges will decide". The FAQ says the test depends on "the mechanism of communication … and the semantics of the communication". It also says "pipes, sockets and command-line arguments are communication mechanisms normally used between two separate programs". Intimate exchange of "complex internal data structures" could still make them one program (#MereAggregation).
- **Proprietary systems.** GPL software may be shipped alongside non-GPL software if they communicate "at arms length" (#GPLInProprietarySystem).
- **Private changes.** The GPL does not require you to release modified versions you only use yourself (#GPLRequireSourcePostedPublic).

### What the GPL means for each way of using it

| Approach | What it means |
| --- | --- |
| **`import` `@openzim/libzim` into our Node server** | Our server and libzim form one combined work (§1, FAQ #IfLibraryIsGPL). Publishing the repo or the Docker image conveys it, so the whole server has to go out under GPLv3 (or later) with its source. This rules out keeping the server under a non-GPL licence, and it rules out "all rights reserved", which is the repo's status today. |
| **Bundle kiwix-js code into our browser bundle** | Sending a JS bundle to a browser transfers a copy, so it is conveying (§0). The bundle becomes a GPLv3 combined work, and every viewer is a recipient owed source. **Judgement:** the FSF's view that JS sent to a browser counts as distribution is widely accepted, but this session could not read the FAQ entry that says so. |
| **Run `kiwix-serve` as a separate container; our app talks HTTP to it** | Most likely an aggregate: HTTP is a socket between separate programs (FAQ #MereAggregation, GPLv3 §5), so our code keeps whatever licence we choose. If we only point a compose file at Kiwix's own image ([`ghcr.io/kiwix/kiwix-serve`](https://github.com/kiwix/kiwix-tools/blob/main/README.md)), the installer pulls it from Kiwix and we convey nothing. If we rebuild, modify or re-host that image, we convey it and must offer its source (§6). **Judgement:** reverse-proxying kiwix-serve's HTML and adding our own shell around it is still arm's length. Rewriting its internals, or depending on its internal data structures, would weaken that argument. |
| **Write our own ZIM reader from the openZIM spec, without Kiwix code** | No GPL obligation; reading a file format is not copying code. This costs the most work. |

**The repo has no LICENSE file**, and the root `package.json` has no `license` field. Without a licence, nobody else gets permission to copy, modify or redistribute the code. That contradicts "apps anyone can install", and it is incompatible with the first two rows above, which require GPLv3-or-later for the combined work. Whichever route is chosen, the repo, or at least `apps/encyclopedia`, needs an explicit licence. A different app or package in the monorepo can keep a different licence, because sitting in the same repository is aggregation, not combination (GPLv3 §5). **Judgement:** shared packages the Encyclopedia server imports would need to be GPL-compatible, such as MIT, Apache-2.0 or GPL.

## 2. Wikipedia text: CC BY-SA 4.0 and GFDL

### Which licence applies

- The Wikimedia Terms of Use, §7, say contributed text is licensed under CC BY-SA 4.0 and the GFDL, and that reusers may comply with either or both _(excerpt)_. The source is the [Terms of Use](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use).
- Text imported from CC BY-SA-only sources cannot be reused under the GFDL _(excerpt)_. The sources are [Wikipedia:Copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights) and [Licensing update Q&A](https://meta.wikimedia.org/wiki/Licensing_update/Questions_and_Answers). **Judgement:** follow CC BY-SA 4.0 alone. It covers all the text, and it is far lighter than the GFDL, which asks for things like including the full licence text.

### What CC BY-SA 4.0 requires

Quotations are from the legal code, read from [Creative Commons' `cc-legal-tools-data`](https://github.com/creativecommons/cc-legal-tools-data/blob/main/docs/licenses/by-sa/4.0/legalcode.en.html).

- **Serving it counts as Share.** "Share" means "to provide material to the public by any means or process that requires permission", which includes making it available on demand (§1(k)). An installer who exposes their Encyclopedia to anyone else is Sharing. **Judgement:** one person reading it on their own LAN arguably is not "the public". It costs nothing to comply anyway.
- **Attribution** (§3(a)(1)). If you Share, you must "retain the following if it is supplied": creator identification, copyright notice, a licence notice, a warranty-disclaimer notice, and "a URI or hyperlink to the Licensed Material to the extent reasonably practicable". You must "indicate if You modified the Licensed Material". You must also "indicate the Licensed Material is licensed under this Public License, and include the text of, or the URI or hyperlink to, this Public License".
- **Reasonable manner** (§3(a)(2)). These conditions may be met "in any reasonable manner based on the medium, means, and context".
- **ShareAlike** (§3(b)). This applies only "if You Share Adapted Material You produce". Adapted Material is material "derived from or based upon the Licensed Material" (§1(a)). Our contributions to adapted material must be under CC BY-SA 4.0 or later, or a compatible licence, with a link to it, and with no added terms or DRM that restrict recipients (§3(b)(1)–(3), §2(a)(5)(C)).
- **No implied endorsement** (§2(a)(6)). The licence is not permission "to assert or imply that You are connected with, or sponsored, endorsed, or granted official status by, the Licensor".
- **Trademarks not licensed** (§2(b)(2)). "Patent and trademark rights are not licensed under this Public License."

### What Wikimedia's own guidance asks _(excerpt)_

The sources are [Wikipedia:Reusing Wikipedia content](https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content), [Wikipedia:Copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights) and [Terms of Use §7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use).

- **Credit the authors** in one of three ways: (a) a hyperlink, where possible, or URL to the page reused; (b) a link to a stable, freely accessible online copy that credits the authors; or (c) a list of all authors.
- **Add a notice** that the text is under CC BY-SA, with a link to the licence (`https://creativecommons.org/licenses/by-sa/4.0/`) or a copy of it.
- **Licence modifications** under CC BY-SA 4.0 or later.

### How Kiwix ZIMs already carry attribution

mwoffliner adds a footer to every article ([`abstract.renderer.ts`](https://github.com/openzim/mwoffliner/blob/main/src/renderers/abstract.renderer.ts), [`translation/en.json`](https://github.com/openzim/mwoffliner/blob/main/translation/en.json)). The footer reads: "This page is issued from {{creator}}. The text is available under {{license}} unless otherwise noted. Additional terms may apply for the media files."

- `{{creator}}` links to the exact revision the ZIM was built from (`?title=…&oldid=<revisionId>`), with "Last edited on `<date>`" as its tooltip.
- `{{license}}` is the wiki's own licence name and URL.

That link is option (a) above, attribution by link to the page, and the licence notice is in the same footer.

**Duty for Encyclopedia:** leave that footer in place and visible, and keep its links working. When an installer is online, the links go to Wikipedia. When offline, they still name the source and licence. Do not strip, hide or restyle it away.

**Judgement:** rendering ZIM HTML unchanged, or wrapped in our own page shell, is Sharing the original, not producing Adapted Material. Our UI code is not "derived from" the articles, so ShareAlike does not reach it. ShareAlike would apply to edited article text: summaries, rewrites, or AI-generated digests of articles. Shipping any such text needs a CC BY-SA 4.0 licence on that text and a "modified" note (§3(a)(1)(B)). Cosmetic restyling, such as CSS, a dark theme or removing navigation boxes, is in a grey zone. The cheap way out is to state that pages are restyled.

## 3. Images inside ZIM files

- Each media file on Wikipedia has its own licensing statement, which must be checked; images are not always under the text's licence _(excerpt, [Reusing Wikipedia content](https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content), [Wikipedia:Copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights))_. Typical terms are CC BY or CC BY-SA, which need a credit and a licence link, plus public domain and GFDL.
- English Wikipedia also hosts **non-free, fair-use** images, such as logos, album covers and film posters. The Terms of Use say reuse is welcome "though exceptions exist for content contributed under 'fair use'" _(excerpt, [Terms of Use](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use))_.
- **How Kiwix carries image attribution:** only through the footer's general line, "Additional terms may apply for the media files", and the per-article link back to the live page, where each image links to its file description page. The footer code adds no per-image author or licence ([`abstract.renderer.ts`](https://github.com/openzim/mwoffliner/blob/main/src/renderers/abstract.renderer.ts)). **Unverified:** whether Wikipedia ZIMs include `File:` description pages. mwoffliner can scrape non-main namespaces ([README](https://github.com/openzim/mwoffliner/blob/main/README.md)), but this session did not confirm the defaults for Kiwix's published Wikipedia ZIMs. Also unverified: whether fair-use images on English Wikipedia are left out of ZIMs.
- **Judgement:** Kiwix, a Wikimedia-affiliated project, has shipped full Wikipedia ZIMs this way for years. Serving those ZIMs unchanged, with the footer intact, puts an installer in the same position as any Kiwix user. Images are the weakest point: strict per-image CC compliance offline would need credits that the ZIM does not contain. Fair use is a defence in some countries, not a licence, and it may not carry over to someone else's server. An installer who wants to stay clear of both can use a `nopic` ZIM flavour ([mwoffliner `--format`](https://github.com/openzim/mwoffliner/blob/main/README.md)).

## 4. The Wikipedia name and logo

Neither CC BY-SA nor the GFDL grants trademark rights (§2(b)(2) above). The [Wikimedia Foundation Trademark Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_Trademark_Policy) covers every Foundation mark, registered or not, including the non-stylised wordmark "Wikipedia" _(excerpt)_. The [Developer App Guidelines](https://foundation.wikimedia.org/wiki/Legal:Wikimedia_Developer_App_Guidelines) say _(excerpt)_:

- **Describing the content is fine.** Saying an app's content "is derived from Wikipedia" needs no trademark licence.
- **Naming the app needs a licence.** Using "Wikipedia" as the first word of an app's title requires one.
- **The icon needs a licence.** Putting a Wikimedia mark in an app icon requires one, and requests go to `trademarks@wikimedia.org`.
- **Form of the name.** Outside Wikimedia sites, wordmarks must be used in full and correctly capitalised. Logos must not be modified without permission.
- **Notice.** Where reasonable, add a notice that the mark is a Foundation trademark and that you are not endorsed by or affiliated with the Foundation, and use ™ on first use.

Also _(excerpt)_: the Foundation's policy index lists the trademark policy as "last revised February 2014", but the policy page describes a newer version. The current effective date is **unverified**.

**For Encyclopedia this rules out:**

- An app named "Wikipedia …", "WikiReader" or similar.
- The puzzle-globe logo or Wikipedia wordmark styling as our icon or branding.
- Any wording that suggests Wikimedia endorsement.

**It allows** plain descriptive wording, such as "an offline reader for Wikipedia content, built from Kiwix ZIM files". **Judgement:** a ZIM's own illustration or favicon, shown inside the content (for example on a library card), is probably the Wikipedia logo. Showing it as a picture of the ZIM, not as our brand, is a grey area. Keeping our UI's branding neutral avoids the question.

## What this means for Encyclopedia

1. **Choose a licence for the repo now.** There is no LICENSE file and no `license` field today, so nobody may legally install a copy, which defeats the point of the repo.
2. **Pick the GPL boundary on purpose.**
   - If the server imports `@openzim/libzim`, or the client bundles kiwix-js, then `apps/encyclopedia` and everything bundled into it must be published under **GPLv3-or-later**, with the source available.
   - If we run Kiwix's own `kiwix-serve` image as a separate container behind our app, our code can carry any licence. If we modify or re-host the image, we must offer its source.
   - **Judgement:** GPLv3 for this one app is a small cost for an open-source homelab app, and in-process libzim is simpler to run. Either route works once a licence is chosen.
3. **Keep the ZIM footer.** It is how each page meets CC BY-SA's attribution and licence-notice duties: it links to the source revision and names the licence. Also add a site-wide "About / licences" page that says:
   - the text comes from Wikipedia under CC BY-SA 4.0, with a link to the licence;
   - images have their own licences, so check each one on Wikipedia;
   - the page styling has been changed, if it has.
4. **Don't change article text** unless the changed text is also published under CC BY-SA 4.0 and marked as modified. That covers summaries, rewrites and AI-generated digests.
5. **Media is the installer's choice.** Document that `nopic` ZIMs avoid image-licence and fair-use questions. Full-image ZIMs rely on Kiwix's footer-level attribution.
6. **Naming and branding.**
   - Don't call the app "Wikipedia" or use the Wikipedia logo.
   - Describe it as serving Wikipedia content, with "Wikipedia" written in full and correctly capitalised.
   - Add a line such as: "Wikipedia is a trademark of the Wikimedia Foundation. This project is not affiliated with or endorsed by it."

## Still to verify

- Re-read the live pages that this session could check only through search excerpts: [GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html), [Terms of Use §7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use), [Reusing Wikipedia content](https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content), the [Trademark Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_Trademark_Policy) and its effective date, and the [Developer App Guidelines](https://foundation.wikimedia.org/wiki/Legal:Wikimedia_Developer_App_Guidelines).
- Check whether Kiwix's Wikipedia ZIMs include `File:` description pages or fair-use images.
- Check what the ZIM `Illustration` metadata of a Wikipedia ZIM contains.
