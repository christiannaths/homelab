# Specs: Encyclopedia

- Status: Draft
- Decisions: the [Encyclopedia ADRs](../adr/README.md).

Encyclopedia is a read-only copy of Wikipedia that comes already populated. People who have access read and search articles and keep saved lists, online and offline. These specs describe what people can do; the ADRs say why.

| Spec | Covers |
| --- | --- |
| [Reading and search](reading-and-search.md) | Opening articles, links, search online and offline, recently read articles |
| [Saved lists](saved-lists.md) | Saving articles to lists, managing lists, saved articles offline and across updates |
| [Content and updates](content-and-updates.md) | Choosing which Wikipedia an install holds, the starter, monthly updates, the About and licences page |

## Terms

| Term | Meaning |
| --- | --- |
| Reader | Anyone the homelab admin has given access to Encyclopedia ([ADR-ENCY-004](../adr/ADR-ENCY-004-identity.md)) |
| Homelab admin | The person who runs the homelab; the only one who changes the content |
| Content | The one Wikipedia file an install holds: a language and a size |
| Starter | The small Wikipedia file a new install begins with |
| Saved article | An article on at least one of a reader's lists |
| Recently read | Articles a reader opened, kept on their device until it needs room |

## Applies to every spec

- **Nobody edits articles.** No screen offers to change article text.
- **Every article shows its attribution footer**: a link to the article on Wikipedia at the revision the file was made from, the licence, and a note that media files may have other terms ([ADR-ENCY-003](../adr/ADR-ENCY-003-licensing.md)).
- **The app never calls itself Wikipedia.** It says its content comes from Wikipedia.
- **Offline is normal, not an error.** Anything that needs the network says so plainly ("Search all of Wikipedia when you're back online") and offers what works offline instead.
