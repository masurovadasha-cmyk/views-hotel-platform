# V-Market task tab guard

The demo task assignments now use a last-observed storage snapshot and fail closed when another tab changes the task key. The `storage` listener includes the task key, and demo reset clears the task assignments alongside orders, inventory and cart. Staff task writes check freshness immediately before saving. This is a best-effort single-browser protection only: localStorage is not transactional and does not offer compare-and-swap. The server API must own real assignments, permissions and audit history. No production data or payments are used.
