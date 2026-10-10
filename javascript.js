(() => {
    "use strict";

    const PAGE_SIZE = 12;
    const TIMEOUT = 12000;
    const DEFAULT_QUERY = "Australia";


    // =========================
    // BASIC DOM HELPERS
    // =========================

    const $ = (s, r = document) => r.querySelector(s);

    const $$ = (s, r = document) => [
        ...r.querySelectorAll(s)
    ];


    // =========================
    // ESCAPE HTML
    // =========================

    const esc = v =>
        String(v ?? "").replace(
            /[&<>"']/g,
            c => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[c])
        );


    // =========================
    // API BASE
    // =========================

    function base() {
        const b = (window.NFSA_API_BASE || "")
            .trim()
            .replace(/\/+$/, "");

        if (
            !b ||
            b.includes("PASTE_API_BASE_HERE")
        ) {
            throw Error("CONFIG");
        }

        return b;
    }


    // =========================
    // GET VALUE FROM OBJECT
    // =========================

    function val(o, paths) {
        for (const path of paths) {

            const v = path
                .split(".")
                .reduce(
                    (a, k) =>
                        a == null
                            ? undefined
                            : a[k],
                    o
                );

            if (
                v !== undefined &&
                v !== null &&
                v !== ""
            ) {
                return v;
            }
        }

        return "";
    }


    // =========================
    // CONVERT VALUE TO TEXT
    // =========================

    function text(v) {

        if (Array.isArray(v)) {
            return v
                .map(text)
                .filter(Boolean)
                .join(", ");
        }

        if (
            v &&
            typeof v === "object"
        ) {
            return String(
                v.title ||
                v.name ||
                v.label ||
                v.value ||
                ""
            );
        }

        return v == null
            ? ""
            : String(v);
    }


    // =========================
    // NORMALISE NFSA ITEM
    // =========================

    function item(o) {

        return {

            id: text(
                val(o, [
                    "_id",
                    "id",
                    "titleId",
                    "titleID",
                    "versionId"
                ])
            ),

            title: text(
                val(o, [
                    "title",
                    "Title",
                    "name",
                    "Name",
                    "parentTitle.title",
                    "parentTitle.name",
                    "parentVersion.Title",
                    "parentVersion.Name"
                ])
            ) || "Untitled archive item",

            summary: text(
                val(o, [
                    "summary",
                    "description",
                    "synopsis",
                    "parentTitle.summary",
                    "parentVersion.summary"
                ])
            ),

            year: text(
                val(o, [
                    "productionDates.0.fromYear",
                    "yearStr",
                    "year",
                    "productionYear",
                    "date",
                    "parentTitle.year"
                ])
            ),

            medium: text(
                val(o, [
                    "subMedium",
                    "parentTitle.medium",
                    "medium",
                    "forms",
                    "form",
                    "mediaType"
                ])
            ),

            country: text(
                val(o, [
                    "countries",
                    "country",
                    "places.name"
                ])
            ),

            language: text(
                val(o, [
                    "languages",
                    "language"
                ])
            ),

            image: text(
                val(o, [
                    "thumbnail",
                    "thumbnailUrl",
                    "image",
                    "imageUrl",
                    "imageURL",
                    "media.thumbnail",
                    "media.image",
                    "representativeImage",
                    "primaryImage",
                    "mediaItems.0.thumbnail",
                    "mediaItems.0.url"
                ])
            ),

            duration: text(
                val(o, [
                    "durationSeconds",
                    "duration",
                    "runningTime"
                ])
            ),

            credits: val(o, [
                "credits",
                "parentTitle.credits"
            ]),

            colour: text(
                val(o, [
                  "colour"
            ])
    ),

            raw: o
        };
    }


    // =========================
    // FIND RECORDS IN API RESPONSE
    // =========================

    function records(d) {

        if (Array.isArray(d)) {
            return d;
        }

        for (
            const k of [
                "titles",
                "results",
                "items",
                "records",
                "data",
                "hits"
            ]
        ) {

            if (
                Array.isArray(d?.[k])
            ) {
                return d[k];
            }

            if (
                Array.isArray(
                    d?.[k]?.hits
                )
            ) {
                return d[k].hits.map(
                    x => x._source || x
                );
            }
        }

        return d &&
            (
                d._id ||
                d.id ||
                d.title ||
                d.name
            )
            ? [d]
            : [];
    }


    // =========================
    // API GET REQUEST
    // =========================

    async function get(
        path,
        params = {}
    ) {

        const ctl =
            new AbortController();

        const timer =
            setTimeout(
                () => ctl.abort(),
                TIMEOUT
            );

        const url =
            new URL(
                base() + path
            );

        Object.entries(params).forEach(
            ([k, v]) => {

                if (
                    v !== "" &&
                    v != null
                ) {
                    url.searchParams.set(
                        k,
                        v
                    );
                }
            }
        );

        try {

            const r = await fetch(
                url,
                {
                    headers: {
                        Accept:
                            "application/json"
                    },
                    signal: ctl.signal
                }
            );

            if (!r.ok) {
                throw Error(
                    "HTTP " + r.status
                );
            }

            return await r.json();

        } catch (e) {

            if (
                e.name ===
                "AbortError"
            ) {
                throw Error(
                    "TIMEOUT"
                );
            }

            throw e;

        } finally {

            clearTimeout(timer);
        }
    }


    // =========================
    // LOADING / ERROR / EMPTY STATE
    // =========================

    function state(
        type,
        title,
        msg,
        retry = false
    ) {

        return `
            <div
                class="api-state ${type}"
                role="${
                    type === "error"
                        ? "alert"
                        : "status"
                }"
            >

                <span aria-hidden="true">
                    ${
                        type === "loading"
                            ? "…"
                            : type === "error"
                                ? "!"
                                : "⌕"
                    }
                </span>

                <h3>
                    ${esc(title)}
                </h3>

                <p>
                    ${esc(msg)}
                </p>

                ${
                    retry
                        ? `
                            <button
                                class="btn btn-primary"
                                data-retry
                            >
                                Try again
                            </button>
                        `
                        : ""
                }

            </div>
        `;
    }


    // =========================
    // CREATE COLLECTION CARD
    // =========================

    function card(x) {

        const i = item(x);

        const meta = [
          ["Colour", i.colour],
            i.year, 
            i.medium
        ]
            .filter(Boolean)
            .join(" · ") ||
            "Collection item";

        const href = i.id
            ? `item.html?id=${encodeURIComponent(i.id)}`
            : "item.html";

        return `
            <a
                class="card api-card"
                href="${href}"
            >

                <div class="thumb api-thumb">

                    ${
                        i.image
                            ? `
                                <img
                                    class="archive-image"
                                    src="${esc(i.image)}"
                                    alt=""
                                    loading="lazy"
                                    onerror="this.remove()"
                                >
                            `
                            : `
                                <span class="thumb-label">
                                    NFSA<br>
                                    COLLECTION
                                </span>
                            `
                    }

                </div>

                <div class="card-body">

                    <p class="meta">
                        ${esc(meta)}
                    </p>

                    <h3>
                        ${esc(i.title)}
                    </h3>

                    ${
                        i.summary
                            ? `
                                <p class="card-summary">
                                    ${esc(
                                        i.summary.slice(0, 160)
                                    )}
                                    ${
                                        i.summary.length > 160
                                            ? "…"
                                            : ""
                                    }
                                </p>
                            `
                            : ""
                    }

                    <span class="text-link">
                        Explore item →
                    </span>

                </div>

            </a>
        `;
    }


    // =========================
    // RETRY BUTTON
    // =========================

    function bindRetry(node, fn) {

        node
            ?.querySelector("[data-retry]")
            ?.addEventListener(
                "click",
                fn
            );
    }


    // =========================
    // SEARCH
    // =========================

    async function search({
        q = "",
        page = 1,
        filters = {},
        target = "#resultsList",
        count = "#resultsCount",
        title = "#resultsTitle",
        live = "#liveQuery"
    } = {}) {

        const node = $(target);

        if (!node) {
            return;
        }

        node.innerHTML = state(
            "loading",
            "Searching the collection…",
            "Loading records from the NFSA collection."
        );

        if ($(count)) {
            $(count).textContent =
                "Please wait…";
        }

        try {

            const data = await get(
                "/search",
                {
                    query:
                        q ||
                        DEFAULT_QUERY,

                    page,

                    limit:
                        PAGE_SIZE,

                    ...filters
                }
            );

            const rs =
                records(data);

            const items =
                rs.map(item);

            if ($(title)) {

                $(title).textContent =
                    q
                        ? `Results for “${q}”`
                        : "Explore the collection";
            }

            if ($(live)) {

                $(live).textContent =
                    q ||
                    "Australian collection";
            }

            if ($(count)) {

                const total =
                    val(data, [
                        "total",
                        "totalCount",
                        "count"
                    ]);

                $(count).textContent =
                    total
                        ? `${total} records in the collection`
                        : `${items.length} records shown on this page`;
            }

            node.innerHTML =
                items.length
                    ? items
                        .map(card)
                        .join("")
                    : state(
                        "empty",
                        "No results found",
                        "Try another keyword or clear one of your filters."
                    );

            const more =
                $("#loadMore");

            if (more) {

                more.hidden =
                    items.length < PAGE_SIZE;

                more.disabled = false;

                more.textContent =
                    "Load more";
            }

            return items.length;

        } catch (e) {

            node.innerHTML =
                state(
                    "error",
                    "Unable to load the collection",
                    e.message === "CONFIG"
                        ? "Set the local API base in api-config.js first."
                        : e.message === "TIMEOUT"
                            ? "The request took too long. Please try again."
                            : "The collection could not be loaded. Check the connection and try again.",
                    true
                );

            bindRetry(
                node,
                () =>
                    search({
                        q,
                        page,
                        filters,
                        target,
                        count,
                        title,
                        live
                    })
            );

            if ($(count)) {
                $(count).textContent =
                    "Unable to load results";
            }

            return 0;
        }
    }


    // =========================
    // SEARCH NAVIGATION
    // =========================

    function go(q) {

        q = String(q || "").trim();

        location.href =
            q
                ? `search.html?q=${encodeURIComponent(q)}`
                : "search.html";
    }


    // =========================
    // SEARCH OVERLAY
    // =========================

    function openSearch() {

        const o =
            $("#searchOverlay");

        if (o) {

            o.classList.add(
                "is-open"
            );

            o.setAttribute(
                "aria-hidden",
                "false"
            );

            setTimeout(
                () =>
                    $("input", o)?.focus(),
                40
            );
        }
    }


    function closeSearch() {

        const o =
            $("#searchOverlay");

        if (o) {

            o.classList.remove(
                "is-open"
            );

            o.setAttribute(
                "aria-hidden",
                "true"
            );
        }
    }


    // =========================
    // SEARCH PAGE
    // =========================

    async function initSearch() {

        const form =
            $("#apiSearchForm");

        const input =
            $("#archiveSearchInput");

        const params =
            new URLSearchParams(
                location.search
            );

        if (input) {

            input.value =
                params.get("q") || "";
        }

        let q =
            input?.value.trim() || "";

        let page = 1;

        let filters = {};


        const run = () => {

            q =
                input?.value.trim() || "";

            page = 1;

            filters = {};


            if (
                $("#mediumFilter")?.value
            ) {

                filters.subMedium =
                    $("#mediumFilter").value;
            }


            if (
                $("#yearFilter")?.value
            ) {

                filters.year =
                    $("#yearFilter").value;
            }


            search({
                q,
                page,
                filters
            });
        };


        form?.addEventListener(
            "submit",
            e => {

                e.preventDefault();

                run();
            }
        );


        $("#applyFilters")
            ?.addEventListener(
                "click",
                run
            );


        $("#clearFilters")
            ?.addEventListener(
                "click",
                () => {

                    if (input) {
                        input.value = "";
                    }

                    if (
                        $("#mediumFilter")
                    ) {
                        $("#mediumFilter").value =
                            "";
                    }

                    if (
                        $("#yearFilter")
                    ) {
                        $("#yearFilter").value =
                            "";
                    }

                    run();
                }
            );


        $("#loadMore")
            ?.addEventListener(
                "click",
                async () => {

                    page++;

                    const more =
                        $("#loadMore");

                    const node =
                        $("#resultsList");

                    more.disabled = true;

                    more.textContent =
                        "Loading…";


                    try {

                        const d =
                            await get(
                                "/search",
                                {
                                    query:
                                        q ||
                                        DEFAULT_QUERY,

                                    page,

                                    limit:
                                        PAGE_SIZE,

                                    ...filters
                                }
                            );

                        const rs =
                            records(d);


                        if (rs.length) {

                            node.insertAdjacentHTML(
                                "beforeend",
                                rs
                                    .map(card)
                                    .join("")
                            );
                        }


                        more.hidden =
                            rs.length <
                            PAGE_SIZE;

                        more.disabled = false;

                        more.textContent =
                            "Load more";

                    } catch {

                        page--;

                        more.disabled = false;

                        more.textContent =
                            "Load more (retry)";
                    }
                }
            );


        run();
    }


    // =========================
    // EXPLORE PAGE
    // =========================

    async function initExplore() {

        const form =
            $("#exploreSearchForm");

        let page = 1;

        let currentQuery = "";

        let currentFilters = {};


        // =========================
        // LOAD EXPLORE RESULTS
        // =========================

        async function loadExplore(
            reset = false
        ) {

            const node =
                $("#exploreResults");

            const count =
                $("#exploreCount");

            const button =
                $("#exploreLoadMore");


            if (!node) {
                return;
            }


            if (reset) {

                page = 1;

                node.innerHTML =
                    state(
                        "loading",
                        "Loading the collection…",
                        "Finding records from the NFSA collection."
                    );
            }


            if (button) {

                button.disabled = true;

                button.textContent =
                    "Loading…";
            }


            try {

                const data =
                    await get(
                        "/search",
                        {
                            query:
                                currentQuery ||
                                DEFAULT_QUERY,

                            page,

                            limit:
                                PAGE_SIZE,

                            ...currentFilters
                        }
                    );


                const results =
                    records(data);


                const cards =
                    results
                        .map(card)
                        .join("");


                if (reset) {

                    node.innerHTML =
                        cards ||
                        state(
                            "empty",
                            "No results found",
                            "Try another keyword or change your filters."
                        );

                } else {

                    node.insertAdjacentHTML(
                        "beforeend",
                        cards
                    );
                }


                if (count) {

                    count.textContent =
                        `${
                            node.querySelectorAll(
                                ".card"
                            ).length
                        } records loaded`;
                }


                if (button) {

                    button.hidden =
                        results.length <
                        PAGE_SIZE;

                    button.disabled = false;

                    button.textContent =
                        "Load more";
                }


            } catch (error) {

                if (reset) {

                    node.innerHTML =
                        state(
                            "error",
                            "Unable to load the collection",
                            "Please try again.",
                            true
                        );

                    bindRetry(
                        node,
                        () =>
                            loadExplore(true)
                    );
                }


                if (button) {

                    button.disabled = false;

                    button.textContent =
                        "Load more";
                }
            }
        }


        // =========================
        // EXPLORE SEARCH FORM
        // =========================

        form?.addEventListener(
            "submit",
            e => {

                e.preventDefault();


                currentQuery =
                    $("#exploreQuery")
                        ?.value.trim() ||
                    "";


                currentFilters = {};


                if (
                    $("#exploreMedium")
                        ?.value
                ) {

                    currentFilters.subMedium =
                        $("#exploreMedium").value;
                }


                if (
                    $("#exploreYear")
                        ?.value
                ) {

                    currentFilters.year =
                        $("#exploreYear").value;
                }


                loadExplore(true);
            }
        );


        // =========================
        // APPLY EXPLORE FILTERS
        // =========================

        $("#applyExploreFilters")
            ?.addEventListener(
                "click",
                () => {

                    currentQuery =
                        $("#exploreQuery")
                            ?.value.trim() ||
                        "";


                    currentFilters = {};


                    if (
                        $("#exploreMedium")
                            ?.value
                    ) {

                        currentFilters.subMedium =
                            $("#exploreMedium").value;
                    }


                    if (
                        $("#exploreYear")
                            ?.value
                    ) {

                        currentFilters.year =
                            $("#exploreYear").value;
                    }


                    loadExplore(true);
                }
            );


        // =========================
        // LOAD MORE
        // =========================

        $("#exploreLoadMore")
            ?.addEventListener(
                "click",
                () => {

                    page++;

                    loadExplore(false);
                }
            );


        // =========================
        // INITIAL LOAD
        // =========================

        loadExplore(true);
    }


    // =========================
    // HOME PAGE
    // =========================

    async function initHome() {

        const node =
            $("#featuredResults");

        if (!node) {
            return;
        }


        node.innerHTML =
            state(
                "loading",
                "Finding stories…",
                "Loading selected records from the collection."
            );


        try {

            const d =
                await get(
                    "/search",
                    {
                        query: "Australia",
                        page: 1,
                        limit: 4
                    }
                );


            node.innerHTML =
                records(d)
                    .slice(0, 4)
                    .map(card)
                    .join("") ||

                state(
                    "empty",
                    "No featured items",
                    "Explore the collection to find records."
                );


        } catch {

            node.innerHTML =
                state(
                    "error",
                    "Featured items unavailable",
                    "Try searching or exploring the collection.",
                    true
                );


            bindRetry(
                node,
                initHome
            );
        }
    }


    // =========================
    // ITEM DETAIL PAGE
    // =========================

    async function initItem() {

        const node =
            $("#itemContent");

        if (!node) {
            return;
        }


        const id =
            new URLSearchParams(
                location.search
            ).get("id");


        // No ID
        if (!id) {

            node.innerHTML =
                state(
                    "empty",
                    "Choose an archive item",
                    "Open an item from Explore or Search to view its details."
                );

            return;
        }


        // Loading state
        node.innerHTML =
            state(
                "loading",
                "Loading item details…",
                "Retrieving metadata from the collection."
            );


        try {

            const d =
                await get(
                    "/title/" +
                    encodeURIComponent(id)
                );


            // The title endpoint returns
            // the record itself in the current API.
            // Keep support for wrapped responses
            // as a fallback.

            let record = d;


            if (
                d &&
                typeof d.data === "object" &&
                d.data !== null
            ) {

                record =
                    d.data;

            } else if (
                d &&
                typeof d.title === "object" &&
                d.title !== null
            ) {

                record =
                    d.title;
            }


            let i =
                item(record);


            // =========================
            // IMAGE FALLBACK
            // =========================

            if (!i.image) {

                try {

                    const sd =
                        await get(
                            "/search",
                            {
                                id: id,
                                limit: 1
                            }
                        );


                    const sr =
                        records(sd)[0];


                    if (sr) {

                        const si =
                            item(sr);


                        if (si.image) {

                            i.image =
                                si.image;
                        }
                    }

                } catch {}
            }


            // =========================
            // METADATA
            // =========================

            const meta = [
                ["Year", i.year],
                ["Medium / form", i.medium],
                ["Country", i.country],
                ["Language", i.language],
                ["Duration", i.duration]
            ]
                .filter(
                    x => x[1]
                );


            // =========================
            // CREDITS
            // =========================

            const creditValues =
                Array.isArray(i.credits)

                    ? i.credits
                        .map(
                            c =>
                                text(
                                    c?.name ||
                                    c?.title ||
                                    c
                                )
                        )
                        .filter(Boolean)

                    : [
                        text(i.credits)
                    ].filter(Boolean);


            // Remove duplicate credits
            const credits =
                [
                    ...new Set(
                        creditValues
                    )
                ].slice(0, 12);


            // =========================
            // RENDER DETAIL PAGE
            // =========================

            node.innerHTML = `
                <div class="detail">

                    <div class="detail-main">

                        ${
                            i.image

                                ? `
                                    <img
                                        class="detail-image"
                                        src="${esc(i.image)}"
                                        alt=""
                                        onerror="this.remove()"
                                    >
                                `

                                : `
                                    <div class="detail-placeholder">
                                        NFSA COLLECTION
                                    </div>
                                `
                        }


                        <section class="section">

                            <h2>
                                About this item
                            </h2>

                            <p>
                                ${
                                    esc(
                                        i.summary ||
                                        "A detailed description is not available for this record."
                                    )
                                }
                            </p>

                        </section>


                        <section class="section">

                            <h2>
                                Collection information
                            </h2>


                            ${
                                meta.length

                                    ? `
                                        <dl class="metadata-grid">

                                            ${
                                                meta
                                                    .map(
                                                        ([k, v]) => `
                                                            <div>

                                                                <dt>
                                                                    ${esc(k)}
                                                                </dt>

                                                                <dd>
                                                                    ${esc(v)}
                                                                </dd>

                                                            </div>
                                                        `
                                                    )
                                                    .join("")
                                            }

                                        </dl>
                                    `

                                    : `
                                        <p>
                                            Additional metadata is not available.
                                        </p>
                                    `
                            }

                        </section>


                        ${
                            credits.length

                                ? `
                                    <section class="section">

                                        <h2>
                                            Credits
                                        </h2>

                                        <ul class="credits-list">

                                            ${
                                                credits
                                                    .map(
                                                        c => `
                                                            <li>
                                                                ${esc(c)}
                                                            </li>
                                                        `
                                                    )
                                                    .join("")
                                            }

                                        </ul>

                                    </section>
                                `

                                : ""
                        }

                    </div>


                    <aside class="info">

                        <p class="eyebrow">
                            NFSA collection item
                        </p>

                        <h1>
                            ${esc(i.title)}
                        </h1>

                        <p class="meta">
                            Record ID:
                            ${esc(i.id || id)}
                        </p>

                        <a
                            class="btn btn-primary"
                            href="explore.html"
                        >
                            Continue exploring →
                        </a>

                        <a
                            class="btn btn-dark"
                            href="surprise.html"
                        >
                            Surprise me →
                        </a>

                    </aside>

                </div>
            `;


        } catch (e) {

            node.innerHTML =
                state(
                    "error",
                    "Unable to load this item",

                    e.message === "CONFIG"

                        ? "Set the local API base in api-config.js first."

                        : "The item details could not be loaded. Please try again.",

                    true
                );


            bindRetry(
                node,
                initItem
            );
        }
    }


    // =========================
    // SURPRISE PAGE
    // =========================

    async function initSurprise() {

        const node =
            $("#surpriseContent");

        if (!node) {
            return;
        }


        node.innerHTML =
            state(
                "loading",
                "Finding something unexpected…",
                "Searching the collection."
            );


        try {

            const d =
                await get(
                    "/search",
                    {
                        query: "Australia",

                        page:
                            Math.floor(
                                Math.random() * 5
                            ) + 1,

                        limit:
                            PAGE_SIZE
                    }
                );


            const rs =
                records(d)
                    .map(item)
                    .filter(
                        i => i.id
                    );


            if (!rs.length) {
                throw Error("EMPTY");
            }


            const i =
                rs[
                    Math.floor(
                        Math.random() *
                        rs.length
                    )
                ];


            node.innerHTML = `
                <div class="surprise-panel">

                    ${
                        i.image

                            ? `
                                <img
                                    class="surprise-image"
                                    src="${esc(i.image)}"
                                    alt=""
                                    onerror="this.remove()"
                                >
                            `

                            : `
                                <div class="detail-placeholder">
                                    NFSA COLLECTION
                                </div>
                            `
                    }


                    <div class="surprise-copy">

                        <p class="eyebrow">
                            A random collection discovery
                        </p>

                        <h2>
                            ${esc(i.title)}
                        </h2>

                        <p class="meta">
                            ${
                                esc(
                                    [
                                        i.year,
                                        i.medium
                                    ]
                                        .filter(Boolean)
                                        .join(" · ") ||
                                    "Archive item"
                                )
                            }
                        </p>

                        <p>
                            ${
                                esc(
                                    i.summary ||
                                    "Discover this item from Australia's audiovisual collection."
                                )
                            }
                        </p>


                        <a
                            class="btn btn-primary"
                            href="item.html?id=${encodeURIComponent(i.id)}"
                        >
                            Explore item →
                        </a>


                        <button
                            class="btn btn-dark"
                            id="surpriseAgain"
                        >
                            Surprise me again
                        </button>

                    </div>

                </div>
            `;


            $("#surpriseAgain")
                ?.addEventListener(
                    "click",
                    initSurprise
                );


        } catch {

            node.innerHTML =
                state(
                    "error",
                    "No surprise just yet",
                    "The collection could not be reached. Please try again.",
                    true
                );


            bindRetry(
                node,
                initSurprise
            );
        }
    }


    // =========================
    // GLOBAL INITIALISATION
    // =========================

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            // Open search buttons
            $$("[data-open-search]")
                .forEach(
                    a =>
                        a.addEventListener(
                            "click",
                            e => {

                                e.preventDefault();

                                openSearch();
                            }
                        )
                );


            // Search forms
            $$("[data-search-form]")
                .forEach(
                    f =>
                        f.addEventListener(
                            "submit",
                            e => {

                                e.preventDefault();

                                go(
                                    $("input", f)
                                        ?.value || ""
                                );
                            }
                        )
                );


            // Close search
            $("[data-close-search]")
                ?.addEventListener(
                    "click",
                    closeSearch
                );


            // Click outside search overlay
            $("#searchOverlay")
                ?.addEventListener(
                    "click",
                    e => {

                        if (
                            e.target.id ===
                            "searchOverlay"
                        ) {
                            closeSearch();
                        }
                    }
                );


            // Escape key
            document.addEventListener(
                "keydown",
                e => {

                    if (
                        e.key ===
                        "Escape"
                    ) {
                        closeSearch();
                    }
                }
            );


            // =========================
            // DETECT CURRENT PAGE
            // =========================

            const page =
                document.body.dataset.page;


            if (
                page === "search"
            ) {
                initSearch();
            }


            if (
                page === "explore"
            ) {
                initExplore();
            }


            if (
                page === "home"
            ) {
                initHome();
            }


            if (
                page === "item"
            ) {
                initItem();
            }


            if (
                page === "surprise"
            ) {
                initSurprise();
            }

        }
    );

})();