/* =========================================================
   DEBUG_START_SITEP
   REMOVE THIS ENTIRE BLOCK IN CLEANUP
   ========================================================= */
const SITEP_DEBUG = true;

function sitepDebug(label, data){
    if(!SITEP_DEBUG) return;
    console.groupCollapsed("%c[SITEP DEBUG] " + label,
        "background:#405448;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700;");
    if(arguments.length > 1) console.log(data);
    console.groupEnd();
}

function sitepDebugTable(label, data){
    if(!SITEP_DEBUG) return;
    console.groupCollapsed("%c[SITEP DEBUG] " + label,
        "background:#65796c;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700;");
    if(Array.isArray(data)) console.table(data);
    else console.log(data);
    console.groupEnd();
}
/* =========================================================
   DEBUG_END_SITEP
   ========================================================= */


/* =========================================================
   INITIAL DATA
   ========================================================= */

const APP_QS = new URLSearchParams(location.search);
const DEFAULT_API_BASE = "https://binuyp.origami.ms/nodered-app";
const API_BASE = (APP_QS.get("api") || DEFAULT_API_BASE).replace(/\/+$/, "");
const apiUrl = path => API_BASE + (path.startsWith("/") ? path : "/" + path);
const backendUrl = path => {
    if(/^https?:\/\//i.test(path)) return path;
    if(path.startsWith("/nodered-app/")){
        return API_BASE.replace(/\/nodered-app\/?$/, "") + path;
    }
    return apiUrl(path);
};

let SITES = [];

async function fetchInitialSites(){
    const response = await fetch(apiUrl("/api/sites"), {cache:"no-store"});
    if(!response.ok) throw new Error("initial sites HTTP " + response.status);
    const data = await response.json();
    const sites = data?.sites || data?.payload?.sites || data?.payload || data?.data || data;
    SITES = Array.isArray(sites) ? sites : [];
    return SITES;
}


/* =========================================================
   ENTITY CONFIG
   ========================================================= */

/*
    IDs שאנחנו כבר יודעים מהמידע שעבדנו עליו:

    מבנים      e_82
    קומות      e_83
    חדרים      e_88
    ביקורות    e_123
    טיפולים    e_117

    הכנס כאן רק את שני ה-DATA_NAME שחסרים לנו:
    inventory / issues.
*/

const ENTITY_CONFIG = {

    buildings:{
        entity:"e_82",
        siteField:"fld_1934"
    },

    floors:{
        entity:"e_83",
        siteField:"fld_1827"
    },

    rooms:{
        entity:"e_88",
        siteField:"fld_1198"
    },

    inventory:{
        entity:"inventory",
        siteField:"fld_1118.instance_id"
    },

    issues:{
        entity:"issues",
        siteField:"fld_1766"
    },

    reviews:{
        entity:"e_123",
        siteField:"fld_1941"
    },

    treatments:{
        entity:"e_117",
        siteField:"fld_1814"
    },

    contracts:{
        entity:"e_84",
        siteField:"fld_1178"
    }

};


/* =========================================================
   STATE
   ========================================================= */

const state = {

    sites:
        Array.isArray(SITES)
            ? SITES
            : [],

    screen:"sites",

    site:null,

    building:null,

    floor:null,

    room:null,

    inventoryItem:null,

    openCommand:null,

    filters:{
        search:"",
        pikud:""
    },

    sourceStatus:{
        buildings:"idle",
        floors:"idle",
        rooms:"idle",
        inventory:"idle",
        issues:"idle",
        reviews:"idle",
        treatments:"idle"
    }

};


const siteCache =
    new Map();


/* =========================================================
   HELPERS
   ========================================================= */

function esc(value){

    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");

}


function arr(value){

    return Array.isArray(value)
        ? value
        : [];

}


function normalize(value){

    return String(value ?? "")
        .trim()
        .toLowerCase();

}


function unique(values){

    return [
        ...new Set(
            values.filter(Boolean)
        )
    ].sort(
        (a,b)=>
            String(a)
                .localeCompare(
                    String(b),
                    "he"
                )
    );

}


function getCache(){

    if(!state.site)
        return null;


    if(
        !siteCache.has(
            state.site.id
        )
    ){

        siteCache.set(
            state.site.id,
            {
                buildings:null,
                floors:null,
                rooms:null,
                inventory:null,
                issues:null,
                reviews:null,
                treatments:null
            }
        );

    }


    return siteCache.get(
        state.site.id
    );

}


/* =========================================================
   ORIGAMI FILTER
   ========================================================= */

/*
    filters עוברים AS-IS ל-Node-RED,
    ומשם ל-filter ב-Origami Body.
*/

function siteFilter(source, siteId){

    const config =
        ENTITY_CONFIG[source];

    if(
        !config ||
        !config.siteField ||
        !siteId
    ){
        return [];
    }

    return [
        [
            config.siteField,
            "=",
            String(siteId)
        ]
    ];
}


/* =========================================================
   GET /sites/getMore
   ========================================================= */

async function fetchSource(
    source,
    filters=[],
    skip=0,
    count=500
){

    const config =
        ENTITY_CONFIG[source];


    if(!config)
        return [];


    if(
        !config.entity ||
        config.entity.startsWith(
            "REPLACE_"
        )
    ){

        console.warn(
            "Missing entity:",
            source
        );

        return [];

    }


    const requestBody = {
        source: source,
        entity: config.entity,
        skip: skip,
        count: count,
        filters: filters
    };


    /* DEBUG_START_SITEP */
    sitepDebug("REQUEST " + source, requestBody);
    /* DEBUG_END_SITEP */


    const response =
        await fetch(
            apiUrl("/sites/getMore"),
            {
                method:"POST",

                credentials:"same-origin",

                headers:{
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        requestBody
                    )
            }
        );


    if(!response.ok){

        const errorText =
            await response.text();


        /* DEBUG_START_SITEP */
        console.error("[SITEP DEBUG] ERROR " + source, {
            status: response.status,
            body: errorText,
            request: requestBody
        });
        /* DEBUG_END_SITEP */


        throw new Error(
            "Failed loading " +
            source +
            " (" +
            response.status +
            ")"
        );

    }


    const rawText =
        await response.text();


    /*
        A successful empty response means:
        this site has 0 records for this source.
        It is NOT an error.
    */
    if(
        !rawText ||
        !rawText.trim()
    ){

        /* DEBUG_START_SITEP */
        sitepDebug("EMPTY RESPONSE " + source, {
            source: source,
            status: response.status,
            request: requestBody
        });
        sitepDebugTable(
            "TABLE " + source + " (0)",
            []
        );
        /* DEBUG_END_SITEP */

        return [];

    }


    let data;

    try{

        data =
            JSON.parse(
                rawText
            );

    }catch(error){

        /* DEBUG_START_SITEP */
        console.error(
            "[SITEP DEBUG] INVALID JSON " + source,
            {
                status: response.status,
                body: rawText,
                request: requestBody,
                error: error
            }
        );
        /* DEBUG_END_SITEP */

        throw error;

    }


    /* DEBUG_START_SITEP */
    sitepDebug("RESPONSE " + source, {
        source: source,
        count: Array.isArray(data) ? data.length : null,
        response: data
    });
    if(Array.isArray(data)){
        sitepDebugTable("TABLE " + source + " (" + data.length + ")", data.slice(0,50));
    }
    /* DEBUG_END_SITEP */


    return Array.isArray(data)
        ? data
        : [];

}


/* =========================================================
   LOAD SITE SOURCE
   ========================================================= */

async function loadSiteSource(
    source
){

    const cache =
        getCache();


    if(
        cache[source] !== null &&
        state.sourceStatus[source] ===
        "loaded"
    ){

        state.sourceStatus[source] =
            "loaded";

        state.sourceProgress ||= {};
        state.sourceProgress[source] = {
            loaded: arr(cache[source]).length,
            total: state.sourceProgress[source]?.total ?? arr(cache[source]).length
        };

        if(["buildings","floors","rooms","inventory"].includes(source)){
            saveStructureCache();
        }

        safeRenderSiteDashboard("cache "+source);

        return cache[source];

    }


    state.sourceStatus[source] =
        "loading";

    const existingRows =
        arr(cache[source]);

    safeRenderSiteDashboard("loading "+source);


    try{

        const filters =
            siteFilter(
                source,
                state.site.id
            );


        state.sourceProgress ||= {};
        state.sourceProgress[source] = {
            loaded:existingRows.length,
            total:state.sourceProgress[source]?.total ?? null
        };

        const loadedRows =
            await fetchSource(
                source,
                filters,
                existingRows.length,
                SITEP_DEFAULT_PAGE_SIZE,
                progress => {
                    cache[source] = [
                        ...existingRows,
                        ...progress.rows
                    ];
                    state.sourceProgress[source] = {
                        loaded: cache[source].length,
                        total: progress.total
                    };
                    persistSiteCache();
                    safeRenderSiteDashboard("progress "+source);
                }
            );

        cache[source] = [
            ...existingRows,
            ...loadedRows
        ];

        if(source === "projects" && (!cache[source] || cache[source].length === 0)){
            const diagnosticFilters = [
                ["fld_1659","=",String(state.site.id)]
            ];

            debugLog("PROJECTS DIAGNOSTIC RETRY", source, {
                primaryFilter: filters,
                diagnosticFilter: diagnosticFilters
            });

            const diagnosticRows =
                await fetchSource(
                    source,
                    diagnosticFilters
                );

            debugLog("PROJECTS DIAGNOSTIC RESULT", source, {
                received: diagnosticRows.length
            });

            if(diagnosticRows.length){
                cache[source] = diagnosticRows;
            }
        }


        state.sourceStatus[source] =
            "loaded";

        if(["buildings","floors","rooms","inventory"].includes(source)){
            saveStructureCache();
        }

        persistSiteCache();

        safeRenderSiteDashboard("loaded "+source);


        requestAnimationFrame(
            () => {

                const card =
                    document.querySelector(
                        '[data-source-card="' +
                        source +
                        '"]'
                    );


                if(card){

                    card.classList.add(
                        "just-loaded"
                    );


                    setTimeout(
                        () =>
                            card.classList.remove(
                                "just-loaded"
                            ),
                        850
                    );

                }

            }
        );


        return cache[source];

    }catch(error){

        state.sourceStatus[source] =
            "error";

        persistSiteCache();

        safeRenderSiteDashboard("loaded "+source);


        throw error;

    }

}


/* =========================================================
   CORE SITE LOAD
   ========================================================= */

async function loadCoreSite(){

    /* DEBUG_START_SITEP */
    sitepDebug("OPEN SITE", {
        site: state.site,
        cacheBeforeLoad: getCache()
    });
    /* DEBUG_END_SITEP */


    const sources = [
        "buildings",
        "floors",
        "rooms",
        "inventory",
        "issues",
        "reviews",
        "treatments"
    ];


    sources.forEach(
        source => {

            loadSiteSource(
                source
            ).catch(
                error => {

                    /* DEBUG_START_SITEP */
                    console.error(
                        "[SITEP DEBUG] CARD LOAD ERROR " +
                        source,
                        error
                    );
                    /* DEBUG_END_SITEP */

                }
            );

        }
    );

}


/* =========================================================
   HEADER
   ========================================================= */

function renderHeader(){

    return `

        <header class="topbar">

            <div class="brand">

                <div class="logo">

                    <span class="logo-a"></span>
                    <span class="logo-b"></span>
                    <span class="logo-c"></span>

                </div>


                <div>

                    <div class="eyebrow">
                        מרחב בינוי
                    </div>

                    <h1 class="main-title">

                        ${
                            state.site
                                ? esc(state.site.name)
                                : "מרחב המחנות"
                        }

                    </h1>

                </div>

            </div>


            <div class="header-meta">

                <button type="button" class="cache-refresh-btn" id="refreshDataBtn" title="ניקוי המטמון וטעינת הנתונים מחדש">↻ <span>רענן נתונים</span></button>

                ${
                    state.site
                        ? `

                            ${
                                state.site.pikudName
                                    ? `
                                        <span class="header-chip">
                                            ${esc(
                                                state.site.pikudName
                                            )}
                                        </span>
                                    `
                                    : ""
                            }

                            ${
                                state.site.mk
                                    ? `
                                        <span class="header-chip">
                                            מק ${esc(
                                                state.site.mk
                                            )}
                                        </span>
                                    `
                                    : ""
                            }

                        `
                        : `

                            <span class="header-chip">
                                ${state.sites.length}
                                מחנות
                            </span>

                        `
                }

            </div>

        </header>

    `;

}


/* =========================================================
   COMMAND SCREEN
   ========================================================= */

function renderSites(){

    ensureBrandFloatLayer();

    state.screen =
        "sites";

    state.site =
        null;


    const pikuds =
        unique(
            state.sites.map(
                site =>
                    site.pikudName
            )
        );


    document
        .getElementById("view")
        .innerHTML = `

            ${renderHeader()}

            <section class="sites-intro">
                <div class="sites-intro-copy">
                    <div class="sites-intro-kicker">תמונת מצב מרחבית</div>
                    <h2>כל האתרים במקום אחד</h2>
                    <p>בחר פיקוד, אתר או מחנה כדי לעבור ישירות לכרטיס האתר ולנתוני הביצוע.</p>
                </div>
                <div class="sites-intro-art" aria-hidden="true">
                    <svg viewBox="0 0 360 150" preserveAspectRatio="xMidYMid meet">
                        <g fill="none" stroke="#75b6cc" stroke-width="1.4" stroke-linejoin="round">
                            <path d="M36 102 82 78l45 22-46 25z" fill="#fff"/>
                            <path d="M81 125v-48l46 23v45z" fill="#eef8fb"/>
                            <path d="M127 100v45l-46 20v-40z" fill="#e2f2f7"/>
                            <path d="M150 91 204 63l54 27-55 30z" fill="#fff"/>
                            <path d="M203 120V63l55 27v55z" fill="#eef8fb"/>
                            <path d="M258 90v55l-55 24v-49z" fill="#e2f2f7"/>
                            <path d="M272 108 307 90l31 16-35 19z" fill="#fff"/>
                            <path d="M303 125V90l35 16v35z" fill="#eef8fb"/>
                        </g>
                        <g fill="#8fd0df" opacity=".75">
                            <rect x="92" y="105" width="9" height="8"/><rect x="106" y="112" width="9" height="8"/>
                            <rect x="217" y="92" width="11" height="10"/><rect x="235" y="100" width="11" height="10"/>
                        </g>
                        <g stroke="#2388b3" stroke-width="2" fill="none">
                            <path d="M180 65V30m0 9h18m-18 0-10 10"/><path d="M319 93V64m0 7h13"/>
                        </g>
                        <circle cx="286" cy="70" r="7" fill="#31a58d"/>
                        <circle cx="58" cy="62" r="5" fill="#d77cbb"/>
                        <path d="M10 137c80-24 151-4 214-17 55-11 94-3 132 12" fill="none" stroke="#c9e4ec" stroke-width="10" opacity=".65"/>
                    </svg>
                </div>
            </section>

            <section class="search-desk sites-search">

                <input
                    id="siteSearch"
                    class="control"
                    placeholder="
                        חיפוש מחנה, מק,
                        אוגדה או אזור
                    "
                    value="${esc(
                        state.filters.search
                    )}">


                <select
                    id="pikudFilter"
                    class="control">

                    <option value="">
                        כל הפיקודים
                    </option>

                    ${
                        pikuds.map(
                            value => `

                                <option
                                    value="${esc(value)}"
                                    ${
                                        value===
                                        state.filters.pikud
                                            ? "selected"
                                            : ""
                                    }>

                                    ${esc(value)}

                                </option>

                            `
                        ).join("")
                    }

                </select>


                <button
                    id="clearFilters"
                    class="clear">

                    איפוס

                </button>

            </section>


            <section
                id="commands"
                class="commands">
            </section>

        `;


    bindSiteFilters();

    renderCommands();

}


/* =========================================================
   COMMAND DATA
   ========================================================= */

function filteredSites(){

    const search =
        normalize(
            state.filters.search
        );


    return state.sites.filter(
        site => {

            if(
                state.filters.pikud &&
                site.pikudName !==
                state.filters.pikud
            ){

                return false;

            }


            if(search){

                const haystack =
                    normalize(
                        [
                            site.name,
                            site.mk,
                            site.pikudName,
                            site.ugdaName,
                            site.areaName,
                            site.type,
                            site.character
                        ].join(" ")
                    );


                if(
                    !haystack.includes(
                        search
                    )
                ){

                    return false;

                }

            }


            return true;

        }
    );

}


function commandGroups(){

    const groups =
        new Map();


    filteredSites()
        .forEach(
            site => {

                const command =
                    site.pikudName ||
                    "ללא פיקוד";


                if(
                    !groups.has(
                        command
                    )
                ){

                    groups.set(
                        command,
                        []
                    );

                }


                groups
                    .get(command)
                    .push(site);

            }
        );


    return Array
        .from(
            groups.entries()
        )
        .map(
            ([name,sites]) => ({
                name,
                sites
            })
        )
        .sort(
            (a,b) => {

                if(
                    a.name==="ללא פיקוד"
                )
                    return 1;

                if(
                    b.name==="ללא פיקוד"
                )
                    return -1;


                return a.name
                    .localeCompare(
                        b.name,
                        "he"
                    );

            }
        );

}


/* =========================================================
   COMMAND RENDER
   ========================================================= */

let ASSETS = {};
let assetsLoadPromise = null;

async function loadAssets(){
    if(assetsLoadPromise) return assetsLoadPromise;
    assetsLoadPromise = fetch(apiUrl("/assets"), {cache:"no-store"})
        .then(r => {
            if(!r.ok) throw new Error("assets metadata HTTP " + r.status);
            return r.json();
        })
        .then(data => {
            /* /assets may return the map directly or wrapped in payload/data. */
            const map = data?.assets || data?.payload?.assets || data?.payload || data?.data || data;
            ASSETS = map && typeof map === "object" && !Array.isArray(map) ? map : {};
            console.log("[siteP] asset metadata loaded", ASSETS);
            return ASSETS;
        })
        .catch(err => {
            console.warn("[siteP] assets metadata unavailable", err);
            ASSETS = {};
            return ASSETS;
        });
    return assetsLoadPromise;
}

function commandMotifSvg(index){
    /*
      V2 assets architecture:
      one metadata request to /nodered-app/assets returns TYPE -> proxy URL.
      Do not call the retired /assets/command/:name routes.
    */
    const keys = [
        "command_north",
        "command_center",
        "command_south",
        "command_homefront",
        "command_depth",
        "command_tech"
    ];

    const key = keys[Math.abs(Number(index) || 0) % keys.length];
    const raw = ASSETS[key];

    /*
      /assets can expose either a ready proxy URL or only Origami's file_id.
      A bare 24-char id must NEVER be placed directly in <img src>, because the
      browser then resolves it as /nodered-app/<current-page>/<id> and gets 404.
    */
    const assetUrl = value => {
        if(!value) return "";

        /* Prefer file_id over location/url. Origami's location may be a private
           or stale direct path, while our Node-RED proxy is the supported route. */
        if(typeof value === "object"){
            const fileId = value.file_id || value.fileId || value.id || "";
            if(/^[a-f0-9]{24}$/i.test(String(fileId).trim())){
                return apiUrl("/assets/file/") + encodeURIComponent(String(fileId).trim());
            }
            value = value.url || value.file_url || value.fileUrl || value.location || "";
        }

        value = String(value || "").trim();
        if(!value) return "";

        /* Bare Origami file id. */
        if(/^[a-f0-9]{24}$/i.test(value)){
            return apiUrl("/assets/file/") + encodeURIComponent(value);
        }

        /* Old/private URL whose final path segment is only the file id.
           Do not trust that URL: route the id through our proxy. */
        const pathId = value.match(/(?:^|\/)([a-f0-9]{24})(?:[?#].*)?$/i);
        if(pathId){
            return apiUrl("/assets/file/") + encodeURIComponent(pathId[1]);
        }

        /* Origami file API URL: extract f=<file_id> and use our authenticated proxy. */
        const queryId = value.match(/[?&]f=([a-f0-9]{24})(?:&|$)/i);
        if(queryId){
            return apiUrl("/assets/file/") + encodeURIComponent(queryId[1]);
        }

        /* Only genuinely ready URLs are allowed through unchanged. */
        if(/^https?:\/\//i.test(value)) return value;
        if(value.startsWith("/")) return backendUrl(value);

        /* Never emit an unresolved relative asset path into <img src>. */
        console.warn("[siteP] rejected unresolved asset value", value);
        return "";
    };

    const src = assetUrl(raw);
    if(!src) return `<span class="command-motif-img command-motif-placeholder" aria-hidden="true"></span>`;

    return `<img
        class="command-motif-img"
        src="${esc(src)}"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
    >`;
}

function renderCommands(){

    const container=document.getElementById("commands");
    if(!container)return;

    const groups=commandGroups();
    const searching=normalize(state.filters.search)!=="";

    if(!groups.length){
        container.innerHTML=`<div class="empty" style="grid-column:1/-1">לא נמצאו מחנות התואמים לחיפוש</div>`;
        return;
    }

    let activeName=state.openCommand;
    if(searching && !groups.some(g=>g.name===activeName))activeName=groups[0].name;
    const activeGroup=groups.find(g=>g.name===activeName)||null;
    const activeIndex=activeGroup?Math.max(0,groups.findIndex(g=>g.name===activeGroup.name)):0;

    const tiles=groups.map((group,index)=>{
        const open=activeGroup && activeGroup.name===group.name;
        return `
          <article class="command ${open?"open":""}" data-command="${esc(group.name)}">
            <div class="command-head" data-command-toggle="${esc(group.name)}">
              <div class="command-main">
                <div class="command-copy">
                  <div class="command-title">${esc(group.name)}</div>
                  <div class="command-subtitle">${open?"המחנות במרחב הפיקודי":"לחץ להצגת המחנות"}</div>
                </div>
                <div class="command-symbol">${commandMotifSvg(index)}</div>
              </div>
              <div class="command-side">
                <div class="command-number"><strong>${group.sites.length}</strong><span>מחנות</span></div>
                <div class="command-toggle">↓</div>
              </div>
            </div>
          </article>`;
    }).join("");

    const results=activeGroup?`
      <section class="command-results">
        <div class="command-results-head">
          <div class="command-results-title">
            <span class="command-results-mark">${commandMotifSvg(activeIndex)}</span>
            <span>${esc(activeGroup.name)}<small>${activeGroup.sites.length} מחנות במרחב הפיקודי</small></span>
          </div>
        </div>
        <div class="camp-grid">${activeGroup.sites.map(site=>renderCampCard(site)).join("")}</div>
      </section>`:"";

    container.innerHTML=tiles+results;
    bindCommands();
}

/* =========================================================
   CAMP CARD
   ========================================================= */

function renderCampCard(site){

    const total =
        Number(
            site.contractsTotal
        ) || 0;


    const configured =
        Number(
            site.contractsConfigured
        ) || 0;


    const percentage =
        total
            ? Math.round(
                configured /
                total *
                100
            )
            : 0;


    return `

        <article
            class="camp"
            data-site-id="${esc(
                site.id
            )}">


            <div class="camp-arrow">
                ←
            </div>


            <div class="camp-name">

                ${esc(
                    site.name
                )}

            </div>


            <div class="camp-meta">

                ${
                    [
                        site.ugdaName,
                        site.areaName,
                        site.character
                    ]
                    .filter(Boolean)
                    .map(esc)
                    .join(" · ")
                }

            </div>


            <div class="camp-service">

                <div class="service-label">

                    <span>
                        תחומי מענה
                    </span>

                    <span>
                        ${configured}/${total}
                    </span>

                </div>


                <div class="track">

                    <div
                        class="fill"
                        style="
                            width:
                            ${percentage}%
                        ">
                    </div>

                </div>

            </div>

        </article>

    `;

}


/* =========================================================
   COMMAND EVENTS
   ========================================================= */

function bindCommands(){

    document
        .querySelectorAll(
            "[data-command-toggle]"
        )
        .forEach(
            element => {

                element.onclick =
                    () => {

                        const command =
                            element.dataset
                                .commandToggle;


                        if(
                            state.openCommand ===
                            command
                        ){

                            state.openCommand =
                                null;

                        }
                        else{

                            state.openCommand =
                                command;

                        }


                        renderCommands();

                    };

            }
        );


    document
        .querySelectorAll(
            ".camp"
        )
        .forEach(
            card => {

                card.onclick =
                    event => {

                        event.stopPropagation();

                        openSite(
                            card.dataset.siteId
                        );

                    };

            }
        );

}


/* =========================================================
   FILTER EVENTS
   ========================================================= */

function bindSiteFilters(){

    document
        .getElementById(
            "siteSearch"
        )
        .oninput =
            event => {

                state.filters.search =
                    event.target.value;

                renderCommands();

            };


    document
        .getElementById(
            "pikudFilter"
        )
        .onchange =
            event => {

                state.filters.pikud =
                    event.target.value;

                state.openCommand =
                    event.target.value ||
                    null;

                renderCommands();

            };


    document
        .getElementById(
            "clearFilters"
        )
        .onclick =
            () => {

                state.filters = {
                    search:"",
                    pikud:""
                };

                state.openCommand =
                    null;

                renderSites();

            };

}


/* =========================================================
   OPEN SITE
   ========================================================= */

async function openSite(siteId){

    state.site =
        state.sites.find(
            site =>
                String(site.id) ===
                String(siteId)
        );


    if(!state.site)
        return;


    state.screen =
        "site";

    try{
        const qs=new URLSearchParams(location.search);
        qs.set("siteId",String(state.site.id||""));
        qs.set("siteName",String(state.site.name||""));
        history.replaceState(null,"","index.html?"+qs.toString());
    }catch(error){
        console.warn("[SITEP] site url sync failed",error);
    }


    /*
        Open the site immediately.
        No full-screen loader.
        Every card loads independently.
    */
    renderSiteDashboard();

    loadCoreSite();

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function renderNavigation(){

    if(state.screen==="site") return "";

    const items = [

        {
            id:"site",
            label:"תמונת מצב"
        },

        {
            id:"buildings",
            label:"מבנים"
        },

        {
            id:"inventory",
            label:"אינוונטר",
            className:"nav-electric"
        },

        {
            id:"issues",
            label:"תקלות"
        },

        {
            id:"treatments",
            label:"טיפולים"
        },

        {
            id:"reviews",
            label:"ביקורות"
        },

        {
            id:"maintenance",
            label:"מענה אחזקה"
        }

    ];


    return `

        <nav class="site-nav">

            ${
                items.map(
                    item => `

                        <button
                            class="
                                nav
                                ${
                                    item.className ||
                                    ""
                                }
                                ${
                                    state.screen ===
                                    item.id
                                        ? "active"
                                        : ""
                                }
                            "
                            data-screen="${item.id}">

                            ${item.label}

                        </button>

                    `
                ).join("")
            }

        </nav>

    `;

}


function bindNavigation(){

    document
        .querySelectorAll(
            "[data-screen]"
        )
        .forEach(
            button => {

                button.onclick =
                    () => {

                        const screen =
                            button.dataset.screen;


                        if(screen==="site")
                            renderSiteDashboard();

                        if(screen==="buildings")
                            renderBuildings();

                        if(screen==="inventory")
                            renderInventory();

                        if(screen==="issues")
                            renderIssues();

                        if(screen==="treatments")
                            renderTreatments();

                        if(screen==="reviews")
                            renderReviews();

                        if(screen==="maintenance")
                            renderMaintenance();

                    };

            }
        );

}


/* =========================================================
   CACHE REFRESH
   ========================================================= */
function clearSitePBrowserCache(){
    try{
        Object.keys(sessionStorage).forEach(key=>{
            if(key.startsWith("siteP.")) sessionStorage.removeItem(key);
        });
    }catch(error){
        console.warn("[SITEP] cache clear failed",error);
    }
}
function bindCacheRefresh(){
    const btn=document.getElementById("refreshDataBtn");
    if(!btn)return;
    btn.onclick=()=>{
        btn.disabled=true;
        btn.innerHTML="↻ <span>טוען מחדש…</span>";
        clearSitePBrowserCache();
        location.reload();
    };
}

/* =========================================================
   SHELL
   ========================================================= */

function renderShell(content){

    document
        .getElementById("view")
        .innerHTML = `

            ${renderHeader()}

            ${renderNavigation()}

            ${content}

        `;


    bindNavigation();
    bindCacheRefresh();

}


/* =========================================================
   HERO
   ========================================================= */

function hero(
    type,
    title,
    kicker,
    visual=""
){

    const s =
        state.site;


    return `

        <section
            class="
                hero
                hero-${type}
            ">


            <div class="hero-grid">
            </div>


            ${visual}


            <div class="hero-content">

                <button
                    class="back"
                    onclick="renderSites()">

                    → חזרה לפיקודים

                </button>


                <div class="hero-kicker">

                    ${esc(kicker)}

                </div>


                <h2>

                    ${esc(title)}

                </h2>


                <div class="hero-meta">

                    ${
                        [
                            s.pikudName,
                            s.ugdaName,
                            s.areaName,
                            s.type,
                            s.character
                        ]
                        .filter(Boolean)
                        .map(
                            value => `

                                <span>
                                    ${esc(value)}
                                </span>

                            `
                        )
                        .join("")
                    }

                </div>

            </div>

        </section>

    `;

}


/* =========================================================
   HERO VISUALS
   ========================================================= */

function buildingHeroVisual(){

    return `

        <div class="hero-building-model">

            <div class="hero-floor f1"></div>
            <div class="hero-floor f2"></div>
            <div class="hero-floor f3"></div>

        </div>

    `;

}


function inventoryHeroVisual(){

    return `

        <div class="system-map">

            <div class="system-line l1"></div>
            <div class="system-line l2"></div>

            <div class="system-node electric">
                חשמל
            </div>

            <div class="system-node water">
                מים
            </div>

            <div class="system-node air">
                מיזוג
            </div>

            <div class="system-node garden">
                גינון
            </div>

        </div>

    `;

}


/* =========================================================
   DASHBOARD
   ========================================================= */


/* =========================================================
   SITE READINESS / COMPETENCY
   Same business logic as the previous competency flow:
   inventory pricing minus open issue cost, overall + category.
   ========================================================= */

const READINESS_BASE_CATEGORIES = [
    "תשתיות הכרחיות לחייל (תהל)",
    'טנ"א',
    "הנדסה",
    "תקשוב",
    "הגנת מחנה"
];


function deepValueByKey(
    object,
    wantedKey
){

    if(
        object === null ||
        object === undefined
    ){
        return undefined;
    }


    if(
        typeof object !== "object"
    ){
        return undefined;
    }


    if(
        Object.prototype.hasOwnProperty.call(
            object,
            wantedKey
        )
    ){
        const direct =
            object[wantedKey];


        if(
            direct !== null &&
            direct !== undefined &&
            direct !== ""
        ){
            return direct;
        }
    }


    for(
        const value
        of Object.values(object)
    ){

        if(
            value &&
            typeof value === "object"
        ){

            const found =
                deepValueByKey(
                    value,
                    wantedKey
                );


            if(
                found !== undefined &&
                found !== null &&
                found !== ""
            ){
                return found;
            }

        }

    }


    return undefined;

}


function numberOrZero(
    value
){

    if(
        typeof value === "number" &&
        Number.isFinite(value)
    ){
        return value;
    }


    if(
        typeof value === "string"
    ){

        const cleaned =
            value
                .replace(/,/g,"")
                .replace(/[^\d.-]/g,"")
                .trim();


        const number =
            Number(cleaned);


        return Number.isFinite(number)
            ? number
            : 0;

    }


    return 0;

}


function clampPercent(
    value
){

    return Math.max(
        0,
        Math.min(
            100,
            Math.round(
                Number(value) || 0
            )
        )
    );

}


function isClosedIssue(
    issue
){

    const status =
        String(
            deepValueByKey(
                issue,
                "סטטוס"
            ) ??
            issue.status ??
            ""
        ).trim();


    return [
        "סגור",
        "סגורה",
        "נסגרה",
        "הושלם",
        "הושלמה",
        "בוצע",
        "טופל",
        "טופלה"
    ].includes(
        status
    );

}


function inventoryPrice(
    item
){

    return numberOrZero(
        deepValueByKey(
            item,
            "תמחור"
        ) ??
        item.pricing ??
        item.price ??
        item.cost
    );

}


function inventoryReadinessCategory(
    item
){

    return String(
        deepValueByKey(
            item,
            "קטגוריה ללא"
        ) ??
        item.readinessCategory ??
        item.category ??
        ""
    ).trim();

}


function issueCost(
    issue
){

    return numberOrZero(
        deepValueByKey(
            issue,
            "עלות כוללת"
        ) ??
        issue.totalCost ??
        issue.cost
    );

}


function issueReadinessCategory(
    issue
){

    return String(
        deepValueByKey(
            issue,
            "קטגוריה ללא"
        ) ??
        issue.readinessCategory ??
        issue.category ??
        ""
    ).trim();

}


function calculateSiteReadiness(){

    const cache =
        getCache();


    if(!cache){
        return null;
    }


    const inventoryStatus =
        sourceStatus(
            "inventory"
        );


    const issuesStatus =
        sourceStatus(
            "issues"
        );


    if(
        inventoryStatus === "error" ||
        issuesStatus === "error"
    ){

        return {
            status:"error"
        };

    }


    if(
        inventoryStatus !== "loaded" ||
        issuesStatus !== "loaded"
    ){

        return {
            status:"loading"
        };

    }


    const inventory =
        arr(
            cache.inventory
        );


    const openIssues =
        arr(
            cache.issues
        ).filter(
            issue =>
                !isClosedIssue(
                    issue
                )
        );


    const inventoryCategories =
        inventory
            .map(
                inventoryReadinessCategory
            )
            .filter(Boolean);


    const issueCategories =
        openIssues
            .map(
                issueReadinessCategory
            )
            .filter(Boolean);


    const categories =
        unique([
            ...READINESS_BASE_CATEGORIES,
            ...inventoryCategories,
            ...issueCategories
        ]);


    const totalInventory =
        inventory.reduce(
            (sum,item) =>
                sum +
                inventoryPrice(item),
            0
        );


    const totalIssues =
        openIssues.reduce(
            (sum,issue) =>
                sum +
                issueCost(issue),
            0
        );


    const percent =
        totalInventory > 0
            ? clampPercent(
                (
                    (
                        totalInventory -
                        totalIssues
                    ) /
                    totalInventory
                ) * 100
            )
            : (
                totalIssues === 0
                    ? 100
                    : 0
            );


    const categoryData =
        categories.map(
            category => {

                const categoryInventoryItems =
                    inventory.filter(
                        item =>
                            inventoryReadinessCategory(
                                item
                            ) === category
                    );


                const categoryIssueItems =
                    openIssues.filter(
                        issue =>
                            issueReadinessCategory(
                                issue
                            ) === category
                    );


                const inventoryValue =
                    categoryInventoryItems.reduce(
                        (sum,item) =>
                            sum +
                            inventoryPrice(item),
                        0
                    );


                const issueValue =
                    categoryIssueItems.reduce(
                        (sum,issue) =>
                            sum +
                            issueCost(issue),
                        0
                    );


                const value =
                    issueValue === 0
                        ? 100
                        : (
                            inventoryValue > 0
                                ? clampPercent(
                                    (
                                        (
                                            inventoryValue -
                                            issueValue
                                        ) /
                                        inventoryValue
                                    ) * 100
                                )
                                : 0
                        );


                return {
                    name:category,
                    percent:value,
                    inventoryValue:inventoryValue,
                    issueValue:issueValue,
                    inventoryCount:
                        categoryInventoryItems.length,
                    issueCount:
                        categoryIssueItems.length
                };

            }
        );


    return {
        status:"loaded",
        percent:percent,
        totalInventory:totalInventory,
        totalIssues:totalIssues,
        inventoryCount:inventory.length,
        issueCount:openIssues.length,
        categories:categoryData
    };

}


function formatMoneyCompact(
    value
){

    const number =
        Number(value) || 0;


    if(number >= 1000000){

        return "₪" +
            (
                number /
                1000000
            ).toFixed(
                number >= 10000000
                    ? 0
                    : 1
            ) +
            "M";

    }


    if(number >= 1000){

        return "₪" +
            (
                number /
                1000
            ).toFixed(
                number >= 100000
                    ? 0
                    : 1
            ) +
            "K";

    }


    return "₪" +
        Math.round(number)
            .toLocaleString("he-IL");

}


function readinessBuildingSvg(
    percent
){

    const p =
        clampPercent(
            percent
        );


    const y =
        184 -
        (
            p /
            100
        ) * 128;


    const h =
        184 -
        y;


    return `

        <svg
            class="readiness-building"
            viewBox="0 0 220 210"
            aria-label="כשירות ${p}%">


            <defs>

                <clipPath id="readinessBuildingClip">

                    <path
                        d="
                            M38 76
                            L108 40
                            L182 68
                            L182 166
                            L108 205
                            L38 184
                            Z
                        ">
                    </path>

                </clipPath>

            </defs>


            <g clip-path="url(#readinessBuildingClip)">

                <rect
                    class="building-fill"
                    x="24"
                    y="${y}"
                    width="175"
                    height="${h + 24}">
                </rect>

                <path
                    class="readiness-wave"
                    d="
                        M20 ${y + 4}
                        C55 ${y - 4},
                         78 ${y + 10},
                         110 ${y + 3}
                        S165 ${y - 3},
                         205 ${y + 4}
                    ">
                </path>

            </g>


            <path
                class="building-outline"
                d="
                    M38 76
                    L108 40
                    L182 68
                    L108 108
                    Z
                ">
            </path>


            <path
                class="building-outline"
                d="
                    M38 76
                    L38 184
                    L108 205
                    L108 108
                    Z
                ">
            </path>


            <path
                class="building-outline"
                d="
                    M108 108
                    L182 68
                    L182 166
                    L108 205
                    Z
                ">
            </path>


            <path
                class="building-gridline"
                d="
                    M38 112 L108 133 L182 94
                    M38 148 L108 169 L182 130
                    M72 87 L72 194
                    M145 88 L145 185
                ">
            </path>


            <path
                class="building-outline"
                d="
                    M61 127
                    L84 134
                    L84 160
                    L61 153
                    Z

                    M130 125
                    L158 110
                    L158 139
                    L130 154
                    Z
                ">
            </path>

        </svg>

    `;

}


function readinessMotif(
    category
){

    const name =
        normalize(
            category
        );


    if(
        name.includes("תהל") ||
        name.includes("תשתיות הכרחיות")
    ){

        return `
            <svg viewBox="0 0 120 90" aria-hidden="true">
                <path class="motif-line" d="M12 49h31v-18h35v18h30"/>
                <path class="motif-soft" d="M12 58h31v-18h35v18h30"/>
                <path class="motif-line" d="M32 49v22m56-22v22"/>
                <path class="motif-soft" d="M56 28c9 13 13 19 13 27a13 13 0 1 1-26 0c0-8 4-14 13-27Z"/>
            </svg>
        `;

    }


    if(
        name.includes("טנ") ||
        name.includes("אחזקה")
    ){

        return `
            <svg viewBox="0 0 120 90" aria-hidden="true">
                <circle class="motif-fill" cx="58" cy="47" r="22"/>
                <circle class="motif-line" cx="58" cy="47" r="8"/>
                <path class="motif-line" d="M58 16v10m0 42v10M27 47h10m42 0h10M36 25l7 7m30 30 7 7M80 25l-7 7M43 62l-7 7"/>
                <path class="motif-soft" d="M82 65 105 42m-7-8 8 8-8 8"/>
            </svg>
        `;

    }


    if(
        name.includes("הנדסה")
    ){

        return `
            <svg viewBox="0 0 120 90" aria-hidden="true">
                <path class="motif-fill" d="M18 70V38l42-21 42 21v32H18Z"/>
                <path class="motif-line" d="M18 38 60 17l42 21M34 48h17m18 0h17M34 59h17m18 0h17M53 70V58h14v12"/>
                <path class="motif-soft" d="M14 76h92"/>
            </svg>
        `;

    }


    if(
        name.includes("תקשוב") ||
        name.includes("תקשורת")
    ){

        return `
            <svg viewBox="0 0 120 90" aria-hidden="true">
                <circle class="motif-fill" cx="22" cy="46" r="8"/>
                <circle class="motif-fill" cx="60" cy="25" r="8"/>
                <circle class="motif-fill" cx="96" cy="48" r="8"/>
                <circle class="motif-fill" cx="58" cy="69" r="8"/>
                <path class="motif-line" d="M29 42 53 29m14 0 22 14M90 54 65 65M51 65 29 51"/>
                <path class="motif-soft" d="M38 46h42"/>
            </svg>
        `;

    }


    if(
        name.includes("הגנת מחנה") ||
        name.includes("הגנה")
    ){

        return `
            <svg viewBox="0 0 120 90" aria-hidden="true">
                <path class="motif-fill" d="M60 13 94 26v22c0 20-13 31-34 40-21-9-34-20-34-40V26Z"/>
                <path class="motif-line" d="M60 26v46M43 44h34"/>
                <path class="motif-soft" d="M15 74 29 56l14 18m34 0 14-18 14 18"/>
            </svg>
        `;

    }


    return `
        <svg viewBox="0 0 120 90" aria-hidden="true">
            <path class="motif-fill" d="M24 67V30h72v37H24Z"/>
            <path class="motif-line" d="M36 42h48M36 54h34"/>
            <path class="motif-soft" d="M19 73h82"/>
        </svg>
    `;

}


function readinessCategoryCard(
    category
){

    return `

        <article
            class="readiness-category"
            style="
                --readiness:
                ${clampPercent(category.percent)}%;
            ">


            <div class="readiness-category-head">

                <div class="readiness-category-name">
                    ${esc(category.name)}
                </div>

                <div class="readiness-category-value">
                    ${esc(category.percent)}
                    <small>%</small>
                </div>

            </div>


            <div class="readiness-motif">

                ${readinessMotif(
                    category.name
                )}

            </div>


            <div class="readiness-category-bar">

                <span></span>

            </div>


            <div class="readiness-category-meta">

                <div>
                    <span>שווי ציוד</span>
                    <strong>
                        ${esc(
                            formatMoneyCompact(
                                category.inventoryValue
                            )
                        )}
                    </strong>
                </div>

                <div>
                    <span>תקלות פתוחות</span>
                    <strong>
                        ${esc(
                            category.issueCount
                        )}
                    </strong>
                </div>

                <div>
                    <span>עלות השפעה</span>
                    <strong>
                        ${esc(
                            formatMoneyCompact(
                                category.issueValue
                            )
                        )}
                    </strong>
                </div>

            </div>

        </article>

    `;

}


function readinessLoadingHtml(){

    return `

        <div class="readiness-loading">

            <div>

                <div class="readiness-loading-scene">

                    <svg
                        viewBox="0 0 160 85"
                        aria-hidden="true">

                        <path
                            class="readiness-loading-line"
                            d="
                                M12 68
                                H45
                                V42
                                H75
                                V68
                                H108
                                V28
                                H143
                            ">
                        </path>

                        <path
                            class="readiness-loading-line"
                            d="
                                M45 42
                                60 31
                                75 42

                                M108 28
                                125 16
                                143 28
                            ">
                        </path>

                    </svg>

                </div>

                <div>
                    מחשב כשירות מתוך אינוונטר ותקלות פתוחות…
                </div>

            </div>

        </div>

    `;

}


function readinessPanel(){

    const readiness =
        calculateSiteReadiness();


    if(
        !readiness ||
        readiness.status === "loading"
    ){

        return `

            <section class="panel readiness-panel">

                <div class="panel-head">

                    <div>

                        <div class="panel-title">
                            כשירות האתר
                        </div>

                        <div class="panel-sub">
                            שווי אינוונטר מול השפעת תקלות פתוחות
                        </div>

                    </div>

                </div>

                ${readinessLoadingHtml()}

            </section>

        `;

    }


    if(
        readiness.status === "error"
    ){

        return `

            <section class="panel readiness-panel">

                <div class="panel-head">

                    <div>

                        <div class="panel-title">
                            כשירות האתר
                        </div>

                        <div class="panel-sub">
                            לא ניתן להשלים את החישוב כרגע
                        </div>

                    </div>

                </div>

                <div class="readiness-loading">
                    נדרש מידע תקין מאינוונטר ומתקלות.
                </div>

            </section>

        `;

    }


    return `

        <section class="panel readiness-panel">

            <div class="panel-head">

                <div>

                    <div class="panel-title">
                        כשירות האתר
                    </div>

                    <div class="panel-sub">
                        חישוב מקומי · ללא Highcharts · מתעדכן מנתוני האתר
                    </div>

                </div>

            </div>


            <div class="readiness-layout">


                <article class="readiness-main">

                    <div class="readiness-main-copy">

                        <div class="readiness-kicker">
                            כשירות משוקללת
                        </div>

                        <div class="readiness-number">
                            ${esc(readiness.percent)}
                            <small>%</small>
                        </div>

                        <div class="readiness-label">
                            כשירות אתר
                        </div>


                        <div class="readiness-meta">

                            <div class="readiness-meta-row">
                                <span>שווי אינוונטר</span>
                                <strong>
                                    ${esc(
                                        formatMoneyCompact(
                                            readiness.totalInventory
                                        )
                                    )}
                                </strong>
                            </div>

                            <div class="readiness-meta-row">
                                <span>עלות תקלות פתוחות</span>
                                <strong>
                                    ${esc(
                                        formatMoneyCompact(
                                            readiness.totalIssues
                                        )
                                    )}
                                </strong>
                            </div>

                            <div class="readiness-meta-row">
                                <span>תקלות פתוחות</span>
                                <strong>
                                    ${esc(
                                        readiness.issueCount
                                    )}
                                </strong>
                            </div>

                        </div>

                    </div>


                    <div>

                        ${readinessBuildingSvg(
                            readiness.percent
                        )}

                    </div>

                </article>


                <div class="readiness-categories">

                    ${
                        readiness.categories
                            .map(
                                readinessCategoryCard
                            )
                            .join("")
                    }

                </div>


            </div>

        </section>

    `;

}


function sourceStatus(
    source
){

    return (
        state.sourceStatus[source] ||
        "idle"
    );

}


function sourceValue(
    source
){

    const cache =
        getCache();


    if(
        sourceStatus(source) !==
        "loaded"
    ){

        return null;

    }


    if(source==="issues"){

        return arr(
            cache.issues
        ).filter(
            issue =>
                !isClosedIssue(
                    issue
                )
        ).length;

    }


    return arr(
        cache[source]
    ).length;

}


function sourceSvg(
    source
){

    if(source==="buildings"){

        return `
            <svg class="source-card-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M12 53V24L32 13l20 11v29H12Z" stroke="currentColor" stroke-width="2"/>
                <path d="M20 30h8m8 0h8M20 38h8m8 0h8M27 53V44h10v9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;

    }


    if(source==="inventory"){

        return `
            <svg class="source-card-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <rect x="15" y="20" width="34" height="31" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M23 20v-7h18v7M23 31h18M23 39h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;

    }


    if(source==="issues"){

        return `
            <svg class="source-card-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="32" r="22" stroke="currentColor" stroke-width="2"/>
                <path d="M18 32h10l4-7 5 14 4-7h6" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;

    }


    if(source==="treatments"){

        return `
            <svg class="source-card-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M20 45 42 23M26 18l5 5m10 10 5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
                <path d="M17 47a6 6 0 0 0 9 0" stroke="currentColor" stroke-width="2"/>
            </svg>
        `;

    }


    if(source==="reviews"){

        return `
            <svg class="source-card-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <rect x="18" y="11" width="28" height="42" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="m25 35 5 5 11-14M25 21h14" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;

    }


    return `
        <svg class="source-card-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <circle cx="32" cy="32" r="22" stroke="currentColor" stroke-width="2"/>
        </svg>
    `;

}


function siteSourceCard(
    source,
    title,
    description
){

    const status =
        sourceStatus(
            source
        );


    const value =
        sourceValue(
            source
        );


    const statusText =
        status==="loaded"
            ? "הטעינה הושלמה"
            : status==="error"
                ? "שגיאה בטעינה"
                : "טוען נתונים…";


    const displayValue =
        value===null
            ? "טוען…"
            : value;


    return `

        <article
            class="
                site-source-card
                is-${status==="idle" ? "loading" : status}
            "
            data-source-card="${source}"
            data-go="${source}">


            <div class="source-card-top">

                <div>

                    <div class="source-card-title">
                        ${esc(title)}
                    </div>

                    <div class="source-card-description">
                        ${esc(description)}
                    </div>

                </div>


                ${sourceSvg(source)}

            </div>


            <div
                class="
                    source-card-value
                    ${value===null ? "loading-value" : ""}
                ">

                ${esc(displayValue)}

            </div>


            <div class="source-card-status">

                <span class="source-card-status-dot"></span>

                <span>
                    ${esc(statusText)}
                </span>

            </div>

        </article>

    `;

}


function renderSiteDashboard(){

    state.screen =
        "site";


    renderShell(`

        ${
            hero(
                "site",
                state.site.name,
                "תמונת מצב מחנה"
            )
        }


        ${readinessPanel()}


        <section class="panel">

            <div class="panel-head">

                <div>

                    <div class="panel-title">
                        סביבת המחנה
                    </div>

                    <div class="panel-sub">
                        כל שכבה נטענת בנפרד · ניתן להמשיך לעבוד בזמן הטעינה
                    </div>

                </div>

            </div>


            <div class="site-source-grid">

                ${siteSourceCard(
                    "buildings",
                    "מבנים",
                    "מבנה → קומה → חדר"
                )}

                ${siteSourceCard(
                    "inventory",
                    "אינוונטר",
                    "מערכות וציוד"
                )}

                ${siteSourceCard(
                    "issues",
                    "תקלות פתוחות",
                    "אירועים הדורשים טיפול"
                )}

                ${siteSourceCard(
                    "treatments",
                    "טיפולים",
                    "תחזוקה מתוכננת"
                )}

                ${siteSourceCard(
                    "reviews",
                    "ביקורות",
                    "ביקורות וממצאים"
                )}

            </div>

        </section>

    `);


    bindPortalClicks();

}


/* =========================================================
   KPI / PORTAL
   ========================================================= */

function kpi(
    label,
    value,
    note,
    screen
){

    return `

        <article
            class="kpi"
            data-go="${screen}">

            <div class="kpi-label">
                ${esc(label)}
            </div>

            <div class="kpi-value">
                ${esc(value)}
            </div>

            <div class="kpi-note">
                ${esc(note)}
            </div>

        </article>

    `;

}


function dashboardPortal(
    title,
    number,
    description,
    screen
){

    return `

        <article
            class="building-card"
            data-go="${screen}">

            <div class="building-model">

                <div class="building-layer one"></div>
                <div class="building-layer two"></div>
                <div class="building-layer three"></div>

            </div>

            <div class="card-title">
                ${esc(title)}
            </div>

            <div class="card-meta">

                <span>
                    ${esc(number)}
                </span>

                <span>
                    ${esc(description)}
                </span>

            </div>

        </article>

    `;

}


function bindPortalClicks(){

    document
        .querySelectorAll(
            "[data-go]"
        )
        .forEach(
            element => {

                element.onclick =
                    () => {

                        const screen =
                            element.dataset.go;


                        if(screen==="buildings")
                            renderBuildings();

                        if(screen==="inventory")
                            renderInventory();

                        if(screen==="issues")
                            renderIssues();

                        if(screen==="treatments")
                            renderTreatments();

                    };

            }
        );

}


/* =========================================================
   BUILDINGS
   ========================================================= */

function structureBuildingsReady(){
    const cache=getCache()||{};
    return Array.isArray(cache.buildings);
}
function saveStructureCache(){
    if(!state.site) return;
    const cache=getCache()||{};
    const sourceIsLoaded=source=>state.sourceStatus?.[source]==="loaded";
    const loadedRows=source=>
        sourceIsLoaded(source)&&Array.isArray(cache[source])
            ? cache[source]
            : null;
    const snapshot={
        version:"v3.inventoryEntityName",
        site:{id:state.site.id,name:state.site.name||""},
        savedAt:Date.now(),
        buildings:Array.isArray(cache.buildings)?cache.buildings:null,
        floors:loadedRows("floors"),
        rooms:loadedRows("rooms"),
        inventory:loadedRows("inventory"),
        data:{
            buildings:Array.isArray(cache.buildings)?cache.buildings:null,
            floors:loadedRows("floors"),
            rooms:loadedRows("rooms"),
            inventory:loadedRows("inventory")
        },
        complete:{
            buildings:Array.isArray(cache.buildings),
            floors:sourceIsLoaded("floors"),
            rooms:sourceIsLoaded("rooms"),
            inventory:sourceIsLoaded("inventory")
        },
        progress:{
            buildings:state.sourceProgress?.buildings||null,
            floors:state.sourceProgress?.floors||null,
            rooms:state.sourceProgress?.rooms||null,
            inventory:state.sourceProgress?.inventory||null
        }
    };
    try{
        sessionStorage.setItem("siteP.structureCache."+String(state.site.id),JSON.stringify(snapshot));
    }catch(error){
        console.warn("[SITEP] structure cache snapshot failed",error);
    }
}
function openStructure(buildingId=""){
    if(!state.site) return;

    /* Only buildings are required before entering Structure.
       Do not serialize floors/rooms/inventory before navigation. */
    if(!structureBuildingsReady()) return;

    try{
        const backQs=new URLSearchParams(location.search);
        backQs.set("siteId",String(state.site.id||""));
        backQs.set("siteName",String(state.site.name||""));
        history.replaceState(null,"","index.html?"+backQs.toString());
    }catch(error){
        console.warn("[SITEP] return url sync failed",error);
    }

    const qs=new URLSearchParams({
        siteId:String(state.site.id||""),
        siteName:String(state.site.name||"")
    });
    if(buildingId) qs.set("buildingId",String(buildingId));

    qs.set("api", API_BASE);
    location.href="structure.html?"+qs.toString();
}
function renderBuildings(){
    openStructure();
}

function buildingCard(building){

    return `

        <article
            class="building-card"
            data-building-id="${esc(
                building.id
            )}">


            <div class="building-model">

                <div class="building-layer one"></div>
                <div class="building-layer two"></div>
                <div class="building-layer three"></div>

            </div>


            <div class="card-title">

                ${esc(
                    building.name ||
                    (
                        "מבנה "+
                        (
                            building.number ||
                            ""
                        )
                    )
                )}

            </div>


            <div class="card-meta">

                ${
                    building.number
                        ? `
                            <span>
                                מס׳ ${esc(
                                    building.number
                                )}
                            </span>
                        `
                        : ""
                }

                ${
                    building.floorsCount
                        ? `
                            <span>
                                ${esc(
                                    building.floorsCount
                                )}
                                קומות
                            </span>
                        `
                        : ""
                }

                ${
                    building.roomsCount
                        ? `
                            <span>
                                ${esc(
                                    building.roomsCount
                                )}
                                חדרים
                            </span>
                        `
                        : ""
                }

            </div>

        </article>

    `;

}


/* =========================================================
   BUILDING DETAIL
   ========================================================= */

function renderBuildingDetail(){

    const building =
        state.building;


    const cache =
        getCache();


    const floors =
        arr(cache.floors)
            .filter(
                floor =>
                    String(
                        floor.buildingId
                    ) ===
                    String(
                        building.id
                    )
            );


    const rooms =
        arr(cache.rooms)
            .filter(
                room =>
                    String(
                        room.buildingId
                    ) ===
                    String(
                        building.id
                    )
            );


    const inventory =
        arr(cache.inventory)
            .filter(
                item =>
                    String(
                        item.buildingId
                    ) ===
                    String(
                        building.id
                    )
            );


    renderShell(`

        ${
            hero(
                "buildings",
                building.name ||
                    "מבנה "+
                    (
                        building.number ||
                        ""
                    ),
                "פירוק המבנה",
                buildingHeroVisual()
            )
        }


        <section class="kpis">

            ${kpiStatic(
                "קומות",
                floors.length
            )}

            ${kpiStatic(
                "חדרים",
                rooms.length
            )}

            ${kpiStatic(
                "פריטי אינוונטר",
                inventory.length
            )}

            ${kpiStatic(
                "שטח",
                building.area || "—"
            )}

        </section>


        <section class="panel">

            <div class="panel-head">

                <div class="panel-title">
                    קומות המבנה
                </div>

                <button
                    class="clear"
                    onclick="renderBuildings()">

                    חזרה למבנים

                </button>

            </div>


            <div class="building-grid">

                ${
                    floors.length
                        ? floors.map(
                            floor => `

                                <article
                                    class="building-card"
                                    data-floor-id="${esc(
                                        floor.id
                                    )}">

                                    <div class="building-model">

                                        <div class="building-layer one"></div>

                                    </div>

                                    <div class="card-title">

                                        קומה
                                        ${esc(
                                            floor.floorNumber ||
                                            floor.number ||
                                            ""
                                        )}

                                    </div>

                                    <div class="card-meta">

                                        <span>
                                            ${
                                                floor.roomsCount ||
                                                ""
                                            }
                                            חדרים
                                        </span>

                                    </div>

                                </article>

                            `
                        ).join("")
                        : empty(
                            "לא נמצאו קומות"
                        )
                }

            </div>

        </section>

    `);


    document
        .querySelectorAll(
            "[data-floor-id]"
        )
        .forEach(
            element => {

                element.onclick =
                    () => {

                        state.floor =
                            floors.find(
                                floor =>
                                    String(
                                        floor.id
                                    ) ===
                                    String(
                                        element.dataset.floorId
                                    )
                            );


                        renderFloorDetail();

                    };

            }
        );

}


/* =========================================================
   FLOOR / ROOMS
   ========================================================= */

function renderFloorDetail(){

    const cache =
        getCache();


    const rooms =
        arr(cache.rooms)
            .filter(
                room =>
                    String(
                        room.floorId
                    ) ===
                    String(
                        state.floor.id
                    )
            );


    renderShell(`

        ${
            hero(
                "buildings",
                "קומה "+
                    (
                        state.floor.floorNumber ||
                        state.floor.number ||
                        ""
                    ),
                state.building.name ||
                "מבנה",
                buildingHeroVisual()
            )
        }


        <section class="panel">

            <div class="panel-head">

                <div>

                    <div class="panel-title">
                        חדרי הקומה
                    </div>

                    <div class="panel-sub">
                        ${rooms.length}
                        חדרים
                    </div>

                </div>


                <button
                    class="clear"
                    onclick="
                        renderBuildingDetail()
                    ">

                    חזרה למבנה

                </button>

            </div>


            <div class="inventory-grid">

                ${
                    rooms.length
                        ? rooms.map(
                            room => `

                                <article
                                    class="inventory-card"
                                    data-room-id="${esc(
                                        room.id
                                    )}">

                                    <span class="inventory-subject">
                                        חדר
                                    </span>

                                    <div class="card-title">

                                        ${esc(
                                            room.name ||
                                            (
                                                "חדר "+
                                                (
                                                    room.number ||
                                                    ""
                                                )
                                            )
                                        )}

                                    </div>

                                    <div class="card-meta">

                                        ${
                                            room.category
                                                ? `
                                                    <span>
                                                        ${esc(
                                                            room.category
                                                        )}
                                                    </span>
                                                `
                                                : ""
                                        }

                                        ${
                                            room.subCategory
                                                ? `
                                                    <span>
                                                        ${esc(
                                                            room.subCategory
                                                        )}
                                                    </span>
                                                `
                                                : ""
                                        }

                                    </div>

                                </article>

                            `
                        ).join("")
                        : empty(
                            "לא נמצאו חדרים"
                        )
                }

            </div>

        </section>

    `);


    document
        .querySelectorAll(
            "[data-room-id]"
        )
        .forEach(
            element => {

                element.onclick =
                    () => {

                        state.room =
                            rooms.find(
                                room =>
                                    String(
                                        room.id
                                    ) ===
                                    String(
                                        element.dataset.roomId
                                    )
                            );


                        renderRoomDetail();

                    };

            }
        );

}


/* =========================================================
   ROOM
   ========================================================= */

function renderRoomDetail(){

    const inventory =
        arr(
            getCache().inventory
        )
        .filter(
            item =>
                String(
                    item.roomId
                ) ===
                String(
                    state.room.id
                )
        );


    renderShell(`

        ${
            hero(
                "inventory",
                state.room.name ||
                    "חדר "+
                    (
                        state.room.number ||
                        ""
                    ),
                "אינוונטר בחדר",
                inventoryHeroVisual()
            )
        }


        ${inventoryGrid(
            inventory
        )}

    `);


    bindInventoryCards();

}


/* =========================================================
   INVENTORY
   ========================================================= */

function inventoryClass(item){

    const text =
        normalize(
            [
                item.subjectName,
                item.type,
                item.name
            ].join(" ")
        );


    if(
        text.includes("חשמל")
    )
        return "electric";


    if(
        text.includes("מים") ||
        text.includes("ביוב") ||
        text.includes("אינסטל")
    )
        return "water";


    if(
        text.includes("גינון")
    )
        return "garden";


    return "";

}


function renderInventory(){

    state.screen =
        "inventory";


    const inventory =
        arr(
            getCache().inventory
        );


    renderShell(`

        ${
            hero(
                "inventory",
                "אינוונטר ומערכות",
                state.site.name,
                inventoryHeroVisual()
            )
        }


        ${inventoryGrid(
            inventory
        )}

    `);


    bindInventoryCards();

}


function inventoryGrid(inventory){

    return `

        <section class="panel">

            <div class="panel-head">

                <div>

                    <div class="panel-title">
                        ציוד ומערכות
                    </div>

                    <div class="panel-sub">

                        ${inventory.length}
                        פריטים · לחץ לפרטים

                    </div>

                </div>

            </div>


            <div class="inventory-grid">

                ${
                    inventory.length
                        ? inventory.map(
                            item => `

                                <article
                                    class="
                                        inventory-card
                                        ${inventoryClass(
                                            item
                                        )}
                                    "
                                    data-inventory-id="${esc(
                                        item.id
                                    )}">


                                    <span class="inventory-subject">

                                        ${esc(
                                            item.subjectName ||
                                            item.type ||
                                            "אינוונטר"
                                        )}

                                    </span>


                                    <div class="card-title">

                                        ${esc(
                                            item.name ||
                                            item.inventoryName ||
                                            item.type ||
                                            "פריט"
                                        )}

                                    </div>


                                    <div class="card-meta">

                                        ${
                                            item.manufacturer
                                                ? `
                                                    <span>
                                                        ${esc(
                                                            item.manufacturer
                                                        )}
                                                    </span>
                                                `
                                                : ""
                                        }

                                        ${
                                            item.condition
                                                ? `
                                                    <span>
                                                        ${esc(
                                                            item.condition
                                                        )}
                                                    </span>
                                                `
                                                : ""
                                        }

                                        ${
                                            item.quantity
                                                ? `
                                                    <span>
                                                        כמות
                                                        ${esc(
                                                            item.quantity
                                                        )}
                                                    </span>
                                                `
                                                : ""
                                        }

                                    </div>

                                </article>

                            `
                        ).join("")
                        : empty(
                            "לא נמצאו פריטי אינוונטר"
                        )
                }

            </div>

        </section>

    `;

}


function bindInventoryCards(){

    const inventory =
        arr(
            getCache().inventory
        );


    document
        .querySelectorAll(
            "[data-inventory-id]"
        )
        .forEach(
            element => {

                element.onclick =
                    () => {

                        const item =
                            inventory.find(
                                inventoryItem =>
                                    String(
                                        inventoryItem.id
                                    ) ===
                                    String(
                                        element.dataset
                                            .inventoryId
                                    )
                            );


                        openInventoryDrawer(
                            item
                        );

                    };

            }
        );

}


/* =========================================================
   INVENTORY DETAIL
   ========================================================= */

function openInventoryDrawer(item){

    if(!item)
        return;


    state.inventoryItem =
        item;


    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        "drawer-backdrop";


    wrapper.innerHTML = `

        <aside class="drawer">

            <button
                class="drawer-close">

                סגירה ×

            </button>


            <h2 class="drawer-title">

                ${esc(
                    item.name ||
                    item.inventoryName ||
                    item.type ||
                    "פריט אינוונטר"
                )}

            </h2>


            <div class="drawer-sub">

                ${esc(
                    item.subjectName ||
                    ""
                )}

            </div>


            <div class="detail-grid">

                ${detail(
                    "סוג",
                    item.type
                )}

                ${detail(
                    "יצרן",
                    item.manufacturer
                )}

                ${detail(
                    "מצב",
                    item.condition
                )}

                ${detail(
                    "כמות",
                    item.quantity
                )}

                ${detail(
                    "מיקום",
                    item.location
                )}

                ${detail(
                    "שנת התקנה",
                    item.installationYear
                )}

                ${detail(
                    "מספר יצרן",
                    item.manufacturerSerial
                )}

                ${detail(
                    "מספר צ׳",
                    item.militaryNumber
                )}

                ${detail(
                    "עלות",
                    item.cost
                )}

                ${detail(
                    "מבנה",
                    item.buildingName
                )}

                ${detail(
                    "קומה",
                    item.floorName
                )}

                ${detail(
                    "חדר",
                    item.roomName
                )}

            </div>

        </aside>

    `;


    document.body.appendChild(
        wrapper
    );


    wrapper
        .querySelector(
            ".drawer-close"
        )
        .onclick =
            () =>
                wrapper.remove();


    wrapper.onclick =
        event => {

            if(
                event.target ===
                wrapper
            ){

                wrapper.remove();

            }

        };

}


/* =========================================================
   ISSUES
   ========================================================= */

function renderIssues(){

    state.screen =
        "issues";


    const issues =
        arr(
            getCache().issues
        );


    renderShell(`

        ${
            hero(
                "issues",
                "תקלות",
                state.site.name,
                `
                    <div class="issue-line">
                    </div>
                `
            )
        }


        <section class="panel">

            <div class="panel-head">

                <div>

                    <div class="panel-title">
                        תקלות המחנה
                    </div>

                    <div class="panel-sub">

                        ${issues.length}
                        רשומות · לחץ לפרטים

                    </div>

                </div>

            </div>


            ${recordsTable(
                [
                    "תקלה",
                    "מבנה",
                    "חדר",
                    "סטטוס",
                    "תאריך"
                ],

                issues.map(
                    issue => ({

                        id:
                            issue.id,

                        values:[
                            issue.issueType ||
                            issue.type ||
                            issue.description ||
                            "תקלה",

                            issue.buildingName ||
                            "",

                            issue.roomName ||
                            "",

                            issue.status ||
                            "",

                            issue.openDate ||
                            ""
                        ],

                        raw:
                            issue
                    })
                ),

                "issue"
            )}

        </section>

    `);


    bindRecordRows(
        issues,
        "issue"
    );

}


/* =========================================================
   TREATMENTS
   ========================================================= */

function renderTreatments(){

    state.screen =
        "treatments";


    const items =
        arr(
            getCache().treatments
        );


    renderShell(`

        ${
            hero(
                "treatments",
                "טיפולים",
                state.site.name,
                `
                    <div class="tool-screw">
                    </div>
                `
            )
        }


        <section class="panel">

            <div class="panel-head">

                <div>

                    <div class="panel-title">
                        תכנית הטיפולים
                    </div>

                    <div class="panel-sub">

                        ${items.length}
                        טיפולים · לחץ לפרטים

                    </div>

                </div>

            </div>


            ${recordsTable(
                [
                    "טיפול",
                    "נושא",
                    "אינוונטר",
                    "יעד",
                    "סטטוס"
                ],

                items.map(
                    item => ({

                        id:item.id,

                        values:[
                            item.treatmentName ||
                            item.planName ||
                            "",

                            item.subjectName ||
                            "",

                            item.inventoryName ||
                            "",

                            item.targetDate ||
                            "",

                            item.status ||
                            ""
                        ],

                        raw:item
                    })
                ),

                "treatment"
            )}

        </section>

    `);


    bindRecordRows(
        items,
        "treatment"
    );

}


/* =========================================================
   REVIEWS
   ========================================================= */

function renderReviews(){

    state.screen =
        "reviews";


    const items =
        arr(
            getCache().reviews
        );


    renderShell(`

        ${
            hero(
                "reviews",
                "ביקורות",
                state.site.name,
                `
                    <div class="scan-plan">
                    </div>
                `
            )
        }


        <section class="panel">

            <div class="panel-head">

                <div>

                    <div class="panel-title">
                        ביקורות וממצאים
                    </div>

                    <div class="panel-sub">

                        ${items.length}
                        ביקורות

                    </div>

                </div>

            </div>


            ${recordsTable(
                [
                    "סוג",
                    "אובייקט",
                    "תאריך",
                    "ממצאים",
                    "סטטוס"
                ],

                items.map(
                    item => ({

                        id:item.id,

                        values:[
                            item.type ||
                            item.subType ||
                            "",

                            item.inventoryName ||
                            item.floorName ||
                            item.buildingName ||
                            "",

                            item.date ||
                            "",

                            item.findingsCount ||
                            0,

                            item.status ||
                            ""
                        ],

                        raw:item
                    })
                ),

                "review"
            )}

        </section>

    `);


    bindRecordRows(
        items,
        "review"
    );

}


/* =========================================================
   MAINTENANCE / CONTRACT MOTIFS
   ========================================================= */

function renderMaintenance(){

    state.screen =
        "maintenance";


    const contracts =
        arr(
            state.site.contracts
        );


    renderShell(`

        ${
            hero(
                "maintenance",
                "מענה אחזקה",
                state.site.name,
                inventoryHeroVisual()
            )
        }


        <section class="inventory-grid">

            ${
                contracts.map(
                    contract => `

                        <article
                            class="
                                inventory-card
                                ${
                                    serviceClass(
                                        contract.label
                                    )
                                }
                            ">


                            <span class="inventory-subject">

                                ${esc(
                                    contract.label
                                )}

                            </span>


                            <div class="card-title">

                                ${
                                    contract.serviceType
                                        ? esc(
                                            contract.serviceType
                                        )
                                        : "לא הוגדר מענה"
                                }

                            </div>


                            <div class="card-meta">

                                ${
                                    contract.sourceName
                                        ? `
                                            <span>
                                                ${esc(
                                                    contract.sourceName
                                                )}
                                            </span>
                                        `
                                        : ""
                                }

                            </div>

                        </article>

                    `
                ).join("")
            }

        </section>

    `);

}


function serviceClass(label){

    const value =
        normalize(label);


    if(
        value.includes("חשמל") ||
        value.includes("גנרטור") ||
        value.includes("סולאר")
    )
        return "electric";


    if(
        value.includes("מים") ||
        value.includes("ביוב") ||
        value.includes("אינסטל") ||
        value.includes("בריכות")
    )
        return "water";


    if(
        value.includes("גינון") ||
        value.includes("עצים")
    )
        return "garden";


    return "";

}


/* =========================================================
   GENERIC RECORD TABLE
   ========================================================= */

function recordsTable(
    headers,
    rows,
    type
){

    if(!rows.length){

        return empty(
            "אין מידע להצגה"
        );

    }


    return `

        <div class="table-wrap">

            <table>

                <thead>

                    <tr>

                        ${
                            headers.map(
                                header => `

                                    <th>
                                        ${esc(header)}
                                    </th>

                                `
                            ).join("")
                        }

                    </tr>

                </thead>


                <tbody>

                    ${
                        rows.map(
                            row => `

                                <tr
                                    data-record-type="${type}"
                                    data-record-id="${esc(
                                        row.id
                                    )}">

                                    ${
                                        row.values.map(
                                            value => `

                                                <td>
                                                    ${esc(
                                                        value
                                                    )}
                                                </td>

                                            `
                                        ).join("")
                                    }

                                </tr>

                            `
                        ).join("")
                    }

                </tbody>

            </table>

        </div>

    `;

}


/* =========================================================
   RECORD DETAILS
   ========================================================= */

function bindRecordRows(
    records,
    type
){

    document
        .querySelectorAll(
            `[data-record-type="${type}"]`
        )
        .forEach(
            row => {

                row.onclick =
                    () => {

                        const record =
                            records.find(
                                item =>
                                    String(
                                        item.id
                                    ) ===
                                    String(
                                        row.dataset.recordId
                                    )
                            );


                        openGenericDrawer(
                            record,
                            type
                        );

                    };

            }
        );

}


function openGenericDrawer(
    record,
    type
){

    if(!record)
        return;


    const labels = {

        issue:"תקלה",
        treatment:"טיפול",
        review:"ביקורת"

    };


    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        "drawer-backdrop";


    const entries =
        Object.entries(
            record
        )
        .filter(
            ([key,value]) =>
                value !== null &&
                value !== "" &&
                typeof value !==
                    "object"
        )
        .slice(
            0,
            24
        );


    wrapper.innerHTML = `

        <aside class="drawer">

            <button class="drawer-close">
                סגירה ×
            </button>


            <h2 class="drawer-title">

                ${labels[type] || "פרטים"}

            </h2>


            <div class="detail-grid">

                ${
                    entries.map(
                        ([key,value]) =>
                            detail(
                                key,
                                value
                            )
                    ).join("")
                }

            </div>

        </aside>

    `;


    document.body.appendChild(
        wrapper
    );


    wrapper
        .querySelector(
            ".drawer-close"
        )
        .onclick =
            () =>
                wrapper.remove();


    wrapper.onclick =
        event => {

            if(
                event.target ===
                wrapper
            ){

                wrapper.remove();

            }

        };

}


/* =========================================================
   SMALL COMPONENTS
   ========================================================= */

function kpiStatic(
    label,
    value
){

    return `

        <article class="kpi">

            <div class="kpi-label">
                ${esc(label)}
            </div>

            <div class="kpi-value">
                ${esc(value)}
            </div>

        </article>

    `;

}


function detail(
    label,
    value
){

    if(
        value === null ||
        value === undefined ||
        value === ""
    )
        return "";


    return `

        <div class="detail">

            <div class="detail-label">
                ${esc(label)}
            </div>

            <div class="detail-value">
                ${esc(value)}
            </div>

        </div>

    `;

}


function empty(text){

    return `

        <div class="empty">
            ${esc(text)}
        </div>

    `;

}


/* =========================================================
   LOADER
   ========================================================= */

function renderLoader(text){

    document
        .getElementById("view")
        .innerHTML = `

            ${renderHeader()}


            <div class="loader">

                <div>

                    ${esc(text)}

                    <div class="loader-line">
                    </div>

                </div>

            </div>

        `;

}


/* =========================================================
   PARALLAX
   ========================================================= */

document.addEventListener(
    "pointermove",
    event => {

        const x =
            (
                event.clientX /
                window.innerWidth
                -
                .5
            );


        const y =
            (
                event.clientY /
                window.innerHeight
                -
                .5
            );


        document
            .querySelectorAll(
                ".ambient"
            )
            .forEach(
                (element,index) => {

                    const depth =
                        (index+1)*2;


                    element.style.transform =
                        `translate(
                            ${x*depth}px,
                            ${y*depth}px
                        )`;

                }
            );

    }
);



/* =========================================================
   SITEP V5 — NEW SOURCES + PROJECT/BUDGET/GANTT
   ========================================================= */

Object.assign(ENTITY_CONFIG,{
    projects:{entity:"e_104",siteField:"fld_1945"},
    paka:{entity:"pakas",siteField:"fld_1346.instance_id"},
    milestones:{entity:"milestones",siteField:"fld_1942.instance_id"},
    budgetDetails:{entity:"e_98",siteField:"fld_1278.instance_id"},
    withdrawals:{entity:"e_97",siteField:"fld_1503.instance_id"}
});

["projects","paka","milestones","budgetDetails","withdrawals"].forEach(
    source=>state.sourceStatus[source]="idle"
);

function siteCacheKey(siteId){
    return "siteP.siteCache.v3.inventoryEntityName."+String(siteId||"");
}

let siteCachePersistTimer=null;
function persistSiteCache(){
    if(!state.site) return;
    if(siteCachePersistTimer) clearTimeout(siteCachePersistTimer);
    const siteId=state.site.id;
    siteCachePersistTimer=setTimeout(()=>{
        const cache=siteCache.get(siteId);
        if(!cache) return;
        try{
            sessionStorage.setItem(siteCacheKey(siteId),JSON.stringify({
                version:"v3.inventoryEntityName",
                savedAt:Date.now(),
                cache,
                sourceStatus:state.sourceStatus||{},
                sourceProgress:state.sourceProgress||{}
            }));
        }catch(error){
            console.warn("[SITEP] site cache persist failed",error);
        }finally{
            siteCachePersistTimer=null;
        }
    },500);
}

function hydrateSiteCache(siteId){
    try{
        const raw=sessionStorage.getItem(siteCacheKey(siteId));
        if(!raw) return null;
        const snap=JSON.parse(raw);
        if(snap?.version!=="v3.inventoryEntityName") return null;
        if(snap?.sourceStatus){
            state.sourceStatus={
                ...state.sourceStatus,
                ...snap.sourceStatus
            };
        }
        if(snap?.sourceProgress){
            state.sourceProgress={
                ...(state.sourceProgress||{}),
                ...snap.sourceProgress
            };
        }
        return snap?.cache||null;
    }catch(error){
        console.warn("[SITEP] site cache hydrate failed",error);
        return null;
    }
}

function getCache(){
    if(!state.site) return null;
    if(!siteCache.has(state.site.id)){
        siteCache.set(state.site.id,hydrateSiteCache(state.site.id)||{
            buildings:null,floors:null,rooms:null,inventory:null,issues:null,
            reviews:null,treatments:null,projects:null,paka:null,milestones:null,
            budgetDetails:null,withdrawals:null
        });
    }
    const cache=siteCache.get(state.site.id);
    ["projects","paka","milestones","budgetDetails","withdrawals"].forEach(
        source=>{if(!(source in cache)) cache[source]=null;}
    );
    return cache;
}

/* Full pagination: show first result when complete; continue sequentially on full 500-page. */
// DEBUG disabled after navigation diagnosis
function debugLog(){ /* intentionally silent */ }

// =========================================================
// V10 — GLOBAL REQUEST LIMITER
// max 7 concurrent HTTP requests
// 150ms minimum between request starts (~6.67 starts/sec)
// Slow requests do NOT block later requests.
// =========================================================
const SITEP_MAX_CONCURRENT = 7;
const SITEP_MIN_START_INTERVAL_MS = 150;
const SITEP_DEFAULT_PAGE_SIZE = 500;

let sitepActiveRequests = 0;
let sitepLastRequestStartedAt = 0;
let sitepPumpTimer = null;
const sitepPendingRequests = [];
const sitepActiveControllers = new Set();
let sitepRequestGeneration = 0;

function cancelSiteBackgroundRequests(){
    sitepRequestGeneration++;

    if(sitepPumpTimer){
        clearTimeout(sitepPumpTimer);
        sitepPumpTimer = null;
    }

    /* Reject jobs that never started, so their awaiting loaders can finish cleanly. */
    while(sitepPendingRequests.length){
        const item = sitepPendingRequests.shift();
        item.reject(new DOMException("Page navigation cancelled queued request","AbortError"));
    }

    /* Abort requests already in flight. */
    sitepActiveControllers.forEach(controller=>{
        try{ controller.abort(); }catch(_){}
    });
    sitepActiveControllers.clear();
}

function pumpSiteRequests(){
    if(sitepPumpTimer){
        clearTimeout(sitepPumpTimer);
        sitepPumpTimer = null;
    }

    if(sitepActiveRequests >= SITEP_MAX_CONCURRENT || !sitepPendingRequests.length){
        return;
    }

    const elapsed = Date.now() - sitepLastRequestStartedAt;
    const wait = Math.max(0, SITEP_MIN_START_INTERVAL_MS - elapsed);

    if(wait > 0){
        sitepPumpTimer = setTimeout(pumpSiteRequests, wait);
        return;
    }

    const item = sitepPendingRequests.shift();
    sitepActiveRequests++;
    sitepLastRequestStartedAt = Date.now();

    Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
            sitepActiveRequests--;
            pumpSiteRequests();
        });

    if(sitepPendingRequests.length && sitepActiveRequests < SITEP_MAX_CONCURRENT){
        sitepPumpTimer = setTimeout(pumpSiteRequests, SITEP_MIN_START_INTERVAL_MS);
    }
}

function queueSiteRequest(task){
    const generation = sitepRequestGeneration;
    return new Promise((resolve,reject) => {
        sitepPendingRequests.push({
            generation,
            task: async ()=>{
                if(generation !== sitepRequestGeneration){
                    throw new DOMException("Stale queued request","AbortError");
                }
                return task();
            },
            resolve,
            reject
        });
        pumpSiteRequests();
    });
}

function unpackSourceResponse(json){
    if(Array.isArray(json)){
        return {
            rows: json,
            totalCount: null,
            currentPageTotalCount: json.length
        };
    }

    const rowCandidates = [
        json?.payload,
        json?.data?.instance_data,
        json?.instance_data,
        json?.data,
        json?.rows,
        json?.results
    ];

    let rows = [];

    for(const candidate of rowCandidates){
        if(Array.isArray(candidate)){
            rows = candidate;
            break;
        }
    }

    const totalCandidates = [
        json?.total_count,
        json?.info?.total_count,
        json?.data?.total_count,
        json?.meta?.total_count,
        json?.pagination?.total_count,
        json?.response?.info?.total_count
    ];

    const currentCandidates = [
        json?.current_page_total_count,
        json?.info?.current_page_total_count,
        json?.data?.current_page_total_count,
        json?.meta?.current_page_total_count,
        json?.pagination?.current_page_total_count,
        json?.response?.info?.current_page_total_count
    ];

    const totalRaw = totalCandidates.find(v => v !== undefined && v !== null && v !== "");
    const currentRaw = currentCandidates.find(v => v !== undefined && v !== null && v !== "");

    const totalCount = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : null;
    const currentPageTotalCount =
        Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : rows.length;

    return {
        rows,
        totalCount,
        currentPageTotalCount
    };
}

async function fetchSource(source, filters = [], skip = 0, count = SITEP_DEFAULT_PAGE_SIZE, onProgress = null){
    const config = ENTITY_CONFIG[source];

    if(!config){
        throw new Error(`Unknown source: ${source}`);
    }

    const allRows = [];
    let nextSkip = skip;
    let knownTotal = null;

    while(true){
        const requestSkip = nextSkip;

        const response = await queueSiteRequest(async () => {
            debugLog("REQUEST", source, {
                entity: config.entity,
                skip: requestSkip,
                count,
                filters
            });

            const controller = new AbortController();
            sitepActiveControllers.add(controller);

            try{
                return await fetch(apiUrl("/sites/getMore"), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    signal: controller.signal,
                    body: JSON.stringify({
                        source,
                        entity: config.entity,
                        skip: requestSkip,
                        count,
                        filters
                    })
                });
            }finally{
                sitepActiveControllers.delete(controller);
            }
        });

        debugLog("RESPONSE", source, {
            status: response.status,
            ok: response.ok,
            skip: requestSkip,
            count
        });

        if(!response.ok){
            if(source === "paka" && response.status === 504 && count > 100){
                debugLog("PAKA 504 - RETRY SAME NESTED FILTER", source, {
                    filters,
                    originalCount: count,
                    retryCount: 100
                });
                return fetchSource(source, filters, skip, 100, onProgress);
            }

            throw new Error(`Failed loading ${source} (${response.status})`);
        }

        const rawText = await response.text();

        // Empty HTTP body is a valid empty result.
        if(!rawText || !rawText.trim()){
            debugLog("EMPTY RESPONSE", source, {
                skip: requestSkip,
                loaded: allRows.length
            });
            break;
        }

        let json;

        try{
            json = JSON.parse(rawText);
        }catch(error){
            debugLog("INVALID JSON", source, {
                skip: requestSkip,
                body: rawText.slice(0,500)
            });
            throw error;
        }

        const page = unpackSourceResponse(json);

        if(page.totalCount !== null){
            knownTotal = page.totalCount;
        }

        allRows.push(...page.rows);

        if(typeof onProgress==="function"){
            onProgress({
                rows:[...allRows],
                loaded:allRows.length,
                total:knownTotal
            });
        }

        debugLog("TABLE", `${source} page`, {
            skip: requestSkip,
            received: page.rows.length,
            currentPageTotalCount: page.currentPageTotalCount,
            totalCount: knownTotal,
            loaded: allRows.length
        });

        // Preferred stop condition: Origami told us the exact total.
        if(knownTotal !== null){
            if(allRows.length >= knownTotal){
                break;
            }

            // No progress although Origami says more rows exist.
            if(page.rows.length === 0){
                debugLog("PAGINATION STOP - NO PROGRESS", source, {
                    totalCount: knownTotal,
                    loaded: allRows.length
                });
                break;
            }

            nextSkip += count;
            continue;
        }

        // Backward compatibility if Node-RED currently returns only the array.
        // A short page proves there is no next page.
        if(page.rows.length < count){
            break;
        }

        nextSkip += count;
    }

    debugLog("TABLE", source, allRows);

    return allRows;
}


function moneyValue(v){return numberOrZero(v)}
function moneyShort(v){
    const n=moneyValue(v);
    if(Math.abs(n)>=1000000)return "₪"+(n/1000000).toFixed(1)+"M";
    if(Math.abs(n)>=1000)return "₪"+Math.round(n/1000)+"K";
    return "₪"+Math.round(n).toLocaleString("he-IL");
}

function budgetTotals(){
    const c=getCache();
    if(!c || sourceStatus("budgetDetails")!=="loaded" || sourceStatus("withdrawals")!=="loaded")return null;
    const approved=arr(c.budgetDetails).reduce((a,x)=>a+moneyValue(x.amount),0);
    const drawn=arr(c.withdrawals).reduce((a,x)=>a+moneyValue(x.amount),0);
    return {approved,drawn,remaining:approved-drawn};
}

function budgetSummaryCard(){
    const a=sourceStatus("budgetDetails"),b=sourceStatus("withdrawals");
    const error=a==="error"||b==="error",loading=a!=="loaded"||b!=="loaded",t=budgetTotals();
    return `
    <article class="site-source-card is-${error?"error":loading?"loading":"loaded"}" data-source-card="budget" data-go="budget">
      <div class="source-card-top"><div><div class="source-card-title">תקציב וביצוע</div><div class="source-card-description">פירוט תקציבי · משיכות · פק״עות</div></div>${sourceSvg("budgetDetails")}</div>
      ${t?`<div class="budget-card-value">
        <div class="budget-mini"><strong>${esc(moneyShort(t.approved))}</strong><span>פירוט תקציבי</span></div>
        <div class="budget-mini"><strong>${esc(moneyShort(t.drawn))}</strong><span>משיכות</span></div>
        <div class="budget-mini"><strong>${esc(moneyShort(t.remaining))}</strong><span>יתרה</span></div>
      </div>`:`<div class="source-card-value loading-value">${error?"שגיאה":"טוען…"}</div>`}
      <div class="source-card-status"><span class="source-card-status-dot"></span><span>${error?"שגיאה בטעינה":loading?"טוען נתוני תקציב…":"הטעינה הושלמה"}</span></div>
    </article>`;
}

function firstDefined(o,keys){for(const k of keys){const v=o?o[k]:null;if(v!==null&&v!==undefined&&v!=="")return v}return null}
function epochMs(v){
    if(v===null||v===undefined||v==="")return null;
    if(typeof v==="number")return v<100000000000?v*1000:v;
    if(typeof v==="object"){if(v.timestamp!==undefined)return epochMs(v.timestamp);if(v.text)return epochMs(v.text)}
    const x=String(v).trim();
    if(/^\d{9,13}$/.test(x))return epochMs(Number(x));
    const m=x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m)return new Date(+m[3],+m[2]-1,+m[1]).getTime();
    const p=Date.parse(x);return Number.isFinite(p)?p:null;
}
function itemDate(x,keys){return epochMs(firstDefined(x,keys))}

function timelineData(){
    const c=getCache();if(!c)return [];
    const r=[];
    arr(c.projects).forEach(x=>{const a=itemDate(x,["startTs","startDate"]),b=itemDate(x,["estimatedEndTs","estimatedEndDate","endTs","endDate"]);if(a||b)r.push({type:"project",label:x.name||x.projectName||"פרויקט",start:a||b,end:b||a,raw:x})});
    arr(c.paka).forEach(x=>{const a=itemDate(x,["plannedStartTs","plannedStartDate","actualStartTs","actualStartDate"]),b=itemDate(x,["plannedEndTs","plannedEndDate","actualEndTs","actualEndDate"]);if(a||b)r.push({type:"paka",label:x.pakaNumber||x.subjectName||"פק״ע",start:a||b,end:b||a,raw:x})});
    arr(c.treatments).forEach(x=>{const a=itemDate(x,["plannedStartTs","plannedStartDate","startTs","startDate","targetTs","targetDate","dateTs","date"]),b=itemDate(x,["plannedEndTs","plannedEndDate","endTs","endDate"]);if(a||b)r.push({type:"treatment",label:x.name||x.treatmentName||x.subjectName||"טיפול",start:a||b,end:b||a,raw:x})});
    arr(c.milestones).forEach(x=>{const a=itemDate(x,["targetTs","targetDate","actualTs","actualDate"]);if(a)r.push({type:"milestone",label:x.name||x.type||"אבן דרך",start:a,end:a,raw:x})});
    arr(c.reviews).forEach(x=>{const a=itemDate(x,["dateTs","date","plannedDateTs","plannedDate","targetTs","targetDate"]);if(a)r.push({type:"review",label:x.type||x.name||"ביקורת",start:a,end:a,raw:x})});
    arr(c.issues).filter(x=>!isClosedIssue(x)).forEach(x=>{const a=itemDate(x,["openTs","openDateTs","createdTs","createdAt","dateTs","date"]),b=itemDate(x,["targetTs","targetDate","dueTs","dueDate"]);if(a||b)r.push({type:"issue",label:x.name||x.title||x.description||"תקלה",start:a||b,end:b||a,raw:x})});
    return r;
}
function monthStart(d){return new Date(d.getFullYear(),d.getMonth(),1)}
function addMonths(d,n){return new Date(d.getFullYear(),d.getMonth()+n,1)}
function timelineWindow(){const n=new Date();return{start:addMonths(monthStart(n),-3).getTime(),end:addMonths(monthStart(n),10).getTime()}}
function timelinePct(t,a,b){return 100-Math.max(0,Math.min(100,(t-a)/(b-a)*100))}
function timelineReady(){return["projects","paka","milestones","treatments","reviews","issues"].every(x=>["loaded","error"].includes(sourceStatus(x)))}

function siteTimelinePanel(){
    if(!timelineReady())return `<section class="panel timeline-panel"><div class="panel-head"><div><div class="panel-title">תכנית פעילות המחנה</div><div class="panel-sub">פרויקטים · פק״עות · אבני דרך · טיפולים · ביקורות · תקלות</div></div></div><div class="timeline-empty">טוען את ציר הפעילות…<div class="loader-line"></div></div></section>`;
    const w=timelineWindow(),data=timelineData().filter(x=>x.end>=w.start&&x.start<=w.end).sort((a,b)=>a.start-b.start);
    const months=[];for(let d=new Date(w.start);d.getTime()<w.end;d=addMonths(d,1))months.push(new Date(d));
    const today=timelinePct(Date.now(),w.start,w.end);
    return `<section class="panel timeline-panel">
      <div class="panel-head"><div><div class="panel-title">תכנית פעילות המחנה</div><div class="panel-sub">3 חודשים אחורה · היום · 9 חודשים קדימה</div></div><span class="header-chip">${data.length} פריטים בטווח</span></div>
      <div class="timeline-wrap"><div class="timeline">
        <div class="timeline-head"><div class="timeline-label">פעילות</div><div class="timeline-track">
          ${months.map(m=>`<span class="timeline-month" style="left:${timelinePct(m.getTime(),w.start,w.end)}%">${esc(m.toLocaleDateString("he-IL",{month:"short",year:"2-digit"}))}</span>`).join("")}
          <span class="timeline-today" style="left:${today}%"></span>
        </div></div>
        ${data.map((x,i)=>{
            const p1=timelinePct(Math.max(x.start,w.start),w.start,w.end),p2=timelinePct(Math.min(Math.max(x.end,x.start),w.end),w.start,w.end);
            const l=Math.min(p1,p2),width=Math.max(.55,Math.abs(p2-p1));
            const point=x.type==="milestone"||x.type==="review";
            return `<div class="timeline-row"><div class="timeline-label"><strong>${esc(x.label)}</strong><br>${esc({project:"פרויקט",paka:"פק״ע",treatment:"טיפול",milestone:"אבן דרך",review:"ביקורת",issue:"תקלה"}[x.type])}</div><div class="timeline-track"><span class="timeline-today" style="left:${today}%"></span>${point?`<span class="timeline-point ${x.type}" style="left:${p1}%" data-timeline-index="${i}"></span>`:`<span class="timeline-bar ${x.type}" style="left:${l}%;width:${width}%" data-timeline-index="${i}">${esc(x.label)}</span>`}</div></div>`;
        }).join("")||`<div class="timeline-empty">אין פעילויות בטווח הזמן הנוכחי</div>`}
        <div class="timeline-legend"><span><i class="legend-dot legend-project"></i>פרויקט</span><span><i class="legend-dot legend-paka"></i>פק״ע</span><span><i class="legend-dot legend-milestone"></i>אבן דרך</span><span><i class="legend-dot legend-treatment"></i>טיפול</span><span><i class="legend-dot legend-review"></i>ביקורת</span><span><i class="legend-dot legend-issue"></i>תקלה</span></div>
      </div></div>
    </section>`;
}

function bindTimelineClicks(){
    const w=timelineWindow(),data=timelineData().filter(x=>x.end>=w.start&&x.start<=w.end).sort((a,b)=>a.start-b.start);
    document.querySelectorAll("[data-timeline-index]").forEach(el=>el.onclick=e=>{e.stopPropagation();const x=data[+el.dataset.timelineIndex];if(x)openGenericDrawer(x.raw,x.type)});
}

const _sourceSvgV4=sourceSvg;
sourceSvg=function(source){
    if(source==="projects")return `<svg class="source-card-svg" viewBox="0 0 64 64" fill="none"><path d="M10 51h44M16 51V27l16-10 16 10v24M23 34h7m5 0h7M23 42h7m5 0h7" stroke="currentColor" stroke-width="2"/></svg>`;
    if(source==="paka")return `<svg class="source-card-svg" viewBox="0 0 64 64" fill="none"><rect x="14" y="12" width="36" height="42" rx="3" stroke="currentColor" stroke-width="2"/><path d="M22 23h20M22 31h20M39 42l4 4 8-10" stroke="currentColor" stroke-width="2"/></svg>`;
    if(source==="budgetDetails")return `<svg class="source-card-svg" viewBox="0 0 64 64" fill="none"><path d="M12 48h40M17 43V29m10 14V20m10 23V25m10 18V15" stroke="currentColor" stroke-width="2.2"/></svg>`;
    return _sourceSvgV4(source);
};


function ensureBrandFloatLayer(){
    if(document.querySelector(".brand-float-layer"))return;
    const layer=document.createElement("div");
    layer.className="brand-float-layer construction-motif-layer";

    const colors=["#4db6c2","#6caac5","#8ea8c4","#76b5aa","#a9a4c5","#c6a7b8","#d0aa86","#79b7b1"];
    const rand=n=>{
      const x=Math.sin(n*9283.771+17.13)*43758.5453;
      return x-Math.floor(x);
    };

    for(let i=0;i<100;i++){
      const cube=document.createElement("span");
      cube.className="brand-float brand-cube";
      const color=colors[i%colors.length];

      const edge=i%4;
      let sx,sy,ex,ey;
      if(edge===0){sx=-14-rand(i)*20;sy=-10+rand(i+1)*120;ex=108+rand(i+2)*24;ey=-10+rand(i+3)*120}
      if(edge===1){sx=108+rand(i)*22;sy=-10+rand(i+1)*120;ex=-12-rand(i+2)*24;ey=-10+rand(i+3)*120}
      if(edge===2){sx=-10+rand(i)*120;sy=-16-rand(i+1)*20;ex=-10+rand(i+2)*120;ey=108+rand(i+3)*24}
      if(edge===3){sx=-10+rand(i)*120;sy=108+rand(i+1)*24;ex=-10+rand(i+2)*120;ey=-16-rand(i+3)*20}

      const depth=i%6===0;
      const s0=.38+rand(i+4)*1.05;
      const s1=depth?Math.max(.14,s0*(.24+rand(i+5)*.18)):(.38+rand(i+5)*1.05);
      const opacity=.30+rand(i+6)*.40; // 30%–70%
      const size=16+Math.round(rand(i+7)*59); // 16–75px; max 150% of previous 50px
      const dur=55+rand(i+8)*80; // calmer 55–135s traversal

      cube.style.setProperty("--sx",sx+"vw");
      cube.style.setProperty("--sy",sy+"vh");
      cube.style.setProperty("--ex",ex+"vw");
      cube.style.setProperty("--ey",ey+"vh");
      cube.style.setProperty("--s0",s0);
      cube.style.setProperty("--s1",s1);
      cube.style.setProperty("--cube-opacity",opacity.toFixed(2));
      cube.style.setProperty("--cube-color",color);
      cube.style.width=size+"px";
      cube.style.height=size+"px";
      cube.style.animationDuration=dur+"s";
      cube.style.animationDelay=(-rand(i+9)*dur)+"s";
      layer.appendChild(cube);
    }
    document.body.prepend(layer);
}
function clampPct(v){return Math.max(0,Math.min(100,Math.round(Number(v)||0)))}
function parseProgress(v){
    if(v===null||v===undefined)return 0;
    const n=parseFloat(String(v).replace("%","").replace(",","."));
    return Number.isFinite(n)?clampPct(n):0;
}
function siteMetrics(){
    const c=getCache()||{};
    const buildings=arr(c.buildings),rooms=arr(c.rooms),inventory=arr(c.inventory),issues=arr(c.issues),
          projects=arr(c.projects),paka=arr(c.paka),milestones=arr(c.milestones),
          treatments=arr(c.treatments),reviews=arr(c.reviews);
    const openIssues=issues.filter(x=>!isClosedIssue(x));
    const activePaka=paka.filter(x=>!["סגור","נסגר חשבון","נדחה"].includes(String(x.status||"").trim()));
    const avgProgress=paka.length?Math.round(paka.reduce((a,x)=>a+parseProgress(x.progress),0)/paka.length):0;
    const bt=budgetTotals()||{approved:0,drawn:0,remaining:0};
    let readiness=100;
    try{
      const r=typeof readinessData==="function"?readinessData():null;
      if(r && Number.isFinite(Number(r.percent)))readiness=clampPct(r.percent);
    }catch(e){}
    const execution=paka.length?avgProgress:(projects.length?50:0);
    const budget=bt.approved>0?clampPct(bt.drawn/bt.approved*100):0;
    const maintenance=treatments.length?clampPct(100-(openIssues.length/Math.max(1,inventory.length))*15):clampPct(100-(openIssues.length/Math.max(1,inventory.length))*10);
    const control=reviews.length?clampPct(100-Math.min(65,openIssues.length/Math.max(1,reviews.length)*3)):clampPct(100-Math.min(65,openIssues.length/5));
    return {buildings,rooms,inventory,issues,openIssues,projects,paka,activePaka,milestones,treatments,reviews,avgProgress,bt,readiness,execution,budget,maintenance,control};
}
function gauge(label,value,color,sub,go){
    return `<div class="pulse-gauge" ${go?`data-go="${go}"`:""}>
      <div class="pulse-ring" style="--p:${clampPct(value)};--c:${color}"><strong>${clampPct(value)}%</strong></div>
      <b>${esc(label)}</b><small>${esc(sub||"")}</small>
    </div>`;
}
function buildingLabel(building,index){
    const clean=v=>v!==undefined&&v!==null&&String(v).trim()!=="" ? String(v).trim() : "";
    /* These are display fields only. Never use record id as a visible building name. */
    const name=
      clean(building.name) ||
      clean(building.buildingName) ||
      clean(building.structureName) ||
      clean(building.title) ||
      clean(building.label) ||
      clean(building.text);

    const number=
      clean(building.number) ||
      clean(building.buildingNumber) ||
      clean(building.structureNumber) ||
      clean(building.code) ||
      clean(building.assetNumber);

    if(name && number && !name.includes(number)) return `${name} · ${number}`;
    if(name) return name;
    if(number) return `מבנה ${number}`;
    return "מבנה ללא שם";
}
function buildingComplexKey(building){
    return String(
      building.complexId||building.compoundId||building.campusComplexId||
      building.complexName||building.compoundName||building.campusComplexName||
      building.complex||building.compound||""
    ).trim();
}
function buildingComplexLabel(building){
    return String(
      building.complexName||building.compoundName||building.campusComplexName||
      building.complex||building.compound||""
    ).trim();
}
function stableHash(value){
    let h=2166136261;
    const text=String(value??"");
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
    return Math.abs(h>>>0);
}
function buildingArchetype(building,index){
    const types=["tower7","multi","warehouse","hangar","tile","mid","antenna","dish"];
    return types[stableHash(building.id||building.number||building.name||index)%types.length];
}
function buildingGroundY(type){
    /* Lowest visible ground vertex of each archetype in its own SVG coordinates.
       Placement Y now means "ground line", not top-left of the drawing. */
    return {
      tower7:113,
      multi:90,
      warehouse:95,
      hangar:95,
      tile:89,
      mid:88,
      antenna:85,
      dish:85
    }[type] || 90;
}
function isoBuildingSvg(building,index,x,y,scale){
    const type=buildingArchetype(building,index);
    const id=esc(building.id);
    const label=esc(buildingLabel(building,index));
    const cache=getCache()||{};
    const rooms=arr(cache.rooms).filter(r=>String(r.buildingId)===String(building.id)).length;
    const floors=arr(cache.floors).filter(f=>String(f.buildingId)===String(building.id)).length;
    const issues=arr(cache.issues).filter(i=>String(i.buildingId||i.structureId||"")===String(building.id) && !isClosedIssue(i)).length;
    const paka=arr(cache.paka).filter(p=>String(p.buildingId||"")===String(building.id) && !["סגור","נסגר חשבון","נדחה"].includes(String(p.status||"").trim())).length;
    const marker=issues>0?"issue":(paka>0?"work":"ok");
    const markerColor=marker==="issue"?"#ee5662":marker==="work"?"#f2a62f":"#31a58d";

    let shape="";
    if(type==="tower7"){
      const floorLines=[0,1,2,3,4,5,6].map(r=>`<path d="M8 ${25+r*10}l11 5v6l-11-5zm17 7 11 5v6l-11-5z"/>`).join("");
      shape=`<path d="M0 13l31-13 39 15-31 15z" class="roof"/>
             <path d="M0 13v82l39 18V30z" class="front"/>
             <path d="M39 30l31-15v82l-31 16z" class="side"/>
             <g class="windows">${floorLines}</g>
             <path d="M54 29v61M61 26v61" stroke="#b9d8e3" stroke-width="1"/>`;
    }else if(type==="multi"){
      shape=`<path d="M0 20l32-14 40 14-32 16z" class="roof"/>
             <path d="M0 20v52l40 18V36z" class="front"/>
             <path d="M40 36l32-16v52L40 90z" class="side"/>
             <g class="windows">${[0,1,2].map(r=>`<path d="M8 ${35+r*15}l8 4v7l-8-4zm14 6 8 4v7l-8-4z"/>`).join("")}</g>`;
    }else if(type==="warehouse"){
      shape=`<path d="M0 32l36-16 54 20-39 18z" class="roof"/>
             <path d="M0 32v34l51 22V54z" class="front"/>
             <path d="M51 54l39-18v34L51 88z" class="side"/>
             <path d="M14 52l20 9v20l-20-9z" class="door"/>`;
    }else if(type==="hangar"){
      shape=`<path d="M0 43Q24 5 50 30l40 18-39 20z" class="roof"/>
             <path d="M0 43v30l51 22V68z" class="front"/>
             <path d="M51 68l39-20v30L51 95z" class="side"/>
             <path d="M10 56l31 13v20L10 76z" class="door"/>`;
    }else if(type==="tile"){
      shape=`<path d="M0 39l35-25 49 19-34 28z" fill="#e7a37b" stroke="#b9785d"/>
             <path d="M0 39v29l50 21V61z" class="front"/>
             <path d="M50 61l34-28v31L50 89z" class="side"/>
             <path d="M11 55l10 4v11l-10-4zm18 7 10 4v11l-10-4z" class="windows"/>`;
    }else if(type==="mid"){
      shape=`<path d="M0 27l33-15 43 17-35 17z" class="roof"/>
             <path d="M0 27v43l41 18V46z" class="front"/>
             <path d="M41 46l35-17v43L41 88z" class="side"/>
             <g class="windows"><path d="M9 42l9 4v8l-9-4zm15 7 9 4v8l-9-4zm-15 11 9 4v8l-9-4zm15 7 9 4v8l-9-4z"/></g>`;
    }else if(type==="antenna"){
      shape=`<path d="M0 34l30-14 40 16-31 15z" class="roof"/>
             <path d="M0 34v34l39 17V51z" class="front"/><path d="M39 51l31-15v34L39 85z" class="side"/>
             <path d="M38 34V2m-8 13h16M34 8l4-6 4 6" fill="none" stroke="#177ea5" stroke-width="2"/>`;
    }else{
      shape=`<path d="M0 34l30-14 40 16-31 15z" class="roof"/>
             <path d="M0 34v34l39 17V51z" class="front"/><path d="M39 51l31-15v34L39 85z" class="side"/>
             <path d="M39 28V8" stroke="#177ea5" stroke-width="2"/><ellipse cx="47" cy="8" rx="11" ry="5" transform="rotate(-25 47 8)" fill="#d9edf4" stroke="#177ea5"/><path d="M47 8l-8 9" stroke="#177ea5"/>`;
    }

    const groundY=buildingGroundY(type);
    const drawY=y-groundY*scale;
    return `<g class="map-building real-building" data-building-id="${id}" data-building-label="${label}" data-building-rooms="${rooms}" data-building-floors="${floors}" data-building-issues="${issues}" data-building-paka="${paka}" transform="translate(${x} ${drawY}) scale(${scale})">
      <title>${label}</title>
      ${shape}
      <circle cx="73" cy="8" r="7" fill="${markerColor}" stroke="#fff" stroke-width="2"/>
      <rect class="building-hitbox" x="-8" y="-22" width="112" height="145" rx="6" fill="transparent"/>
    </g>`;
}
function cypressSvg(x,y,scale=1){
    return `<g class="cypress" transform="translate(${x} ${y}) scale(${scale})">
      <path d="M0 24v13" stroke="#7d6b54" stroke-width="2"/>
      <path d="M0 0C-10 10-9 25 0 31C9 25 10 10 0 0Z" fill="#78ad82" stroke="#5d936a"/>
      <path d="M0 6C-5 13-5 21 0 25" fill="none" stroke="#9bc5a1" stroke-width="1.3"/>
    </g>`;
}
function campusSvg(m){
    const buildings=arr(m?.buildings);
    const W=1080,H=500;
    const clusterSize=8;

    const complexBuckets=new Map(),unassigned=[];
    buildings.forEach((building,originalIndex)=>{
      const key=buildingComplexKey(building);
      const item={building,originalIndex,complexKey:key,complexLabel:buildingComplexLabel(building)};
      if(!key)unassigned.push(item);
      else{
        if(!complexBuckets.has(key))complexBuckets.set(key,[]);
        complexBuckets.get(key).push(item);
      }
    });

    const clusterGroups=[];
    complexBuckets.forEach((items,key)=>{
      for(let i=0;i<items.length;i+=clusterSize)
        clusterGroups.push({complexKey:key,complexLabel:items[0]?.complexLabel||"",items:items.slice(i,i+clusterSize)});
    });
    for(let i=0;i<unassigned.length;i+=clusterSize)
      clusterGroups.push({complexKey:"",complexLabel:"",items:unassigned.slice(i,i+clusterSize)});
    if(!clusterGroups.length)clusterGroups.push({complexKey:"",complexLabel:"",items:[]});
    const clusterCount=clusterGroups.length;

    /* Same baseline per depth row inside every cluster.
       No building in the same depth layer starts "lower" than its neighbours. */
    const localSlots=[
      {x:58, y:154,s:1.18}, // foreground centre — shared ground baseline
      {x:0,  y:154,s:1.04}, // foreground left
      {x:116,y:154,s:1.02}, // foreground right
      {x:24, y:111,s:.88},  // middle left — shared ground baseline
      {x:82, y:111,s:.85},  // middle centre/right
      {x:137,y:111,s:.82},  // middle far right
      {x:48, y:73,s:.73},   // rear left — shared ground baseline
      {x:108,y:73,s:.70}    // rear right
    ];

    /* First page is intentionally packed from the LEFT.
       38 buildings = 5 clusters and all five fit in this viewport.
       Up to 8 clusters still fit before we extend the virtual city. */
    const pageAnchors=[
      {x:24, y:6,   d:.92},
      {x:224,y:2,   d:.98},
      {x:430,y:8,   d:1.04},
      {x:92, y:218, d:1.10},
      {x:322,y:210, d:1.16},
      {x:554,y:198, d:1.20},
      {x:690,y:12,  d:1.00},
      {x:800,y:218, d:1.18}
    ];

    const clustersPerPage=pageAnchors.length;
    const pageWidth=1040;
    const anchors=[];
    for(let i=0;i<clusterCount;i++){
      const page=Math.floor(i/clustersPerPage);
      const base=pageAnchors[i%clustersPerPage];
      anchors.push({x:base.x+page*pageWidth,y:base.y,d:base.d});
    }
    const pages=Math.max(1,Math.ceil(clusterCount/clustersPerPage));
    const virtualW=pages===1 ? W : W+(pages-1)*pageWidth;

    const placed=[];
    clusterGroups.forEach((group,ci)=>{
      const anchor=anchors[ci] || anchors[anchors.length-1] || {x:28,y:42,d:1};
      group.items.forEach((item,li)=>{
        const p=localSlots[li] || localSlots[li%localSlots.length];
        placed.push({
          building:item.building,index:item.originalIndex,clusterIndex:ci,
          complexKey:group.complexKey,complexLabel:group.complexLabel,
          x:anchor.x+p.x*anchor.d,y:anchor.y+p.y*anchor.d,scale:p.s*anchor.d
        });
      });
    });
    placed.sort((a,b)=>(a.y-b.y)||(a.x-b.x));

    let roads="";
    for(let page=0;page<pages;page++){
      const ox=page*pageWidth;
      roads+=`
        <!-- Strong perspective lying-Y: narrow at the distant left branches,
             wider as the two branches converge toward the near right stem. -->
        <path d="M${ox+1038} 260
                 C${ox+930} 258 ${ox+850} 252 ${ox+760} 230
                 C${ox+650} 202 ${ox+570} 162 ${ox+490} 126
                 C${ox+365} 70 ${ox+220} 58 ${ox+28} 100"
              class="camp-road y-upper"/>
        <path d="M${ox+1038} 260
                 C${ox+930} 258 ${ox+850} 252 ${ox+760} 230
                 C${ox+650} 202 ${ox+570} 162 ${ox+490} 126
                 C${ox+365} 70 ${ox+220} 58 ${ox+28} 100"
              class="camp-road-line"/>
        <path d="M${ox+760} 230
                 C${ox+650} 268 ${ox+585} 320 ${ox+485} 365
                 C${ox+365} 420 ${ox+205} 425 ${ox+25} 374"
              class="camp-road y-lower"/>
        <path d="M${ox+760} 230
                 C${ox+650} 268 ${ox+585} 320 ${ox+485} 365
                 C${ox+365} 420 ${ox+205} 425 ${ox+25} 374"
              class="camp-road-line"/>
        <path d="M${ox+870} 250 C${ox+900} 182 ${ox+942} 120 ${ox+1000} 76"
              class="camp-road minor"/>
        <path d="M${ox+870} 250 C${ox+900} 182 ${ox+942} 120 ${ox+1000} 76"
              class="camp-road-line minor"/>
      `;
    }

    const treeSpots=[
      [18,40,.52],[190,28,.50],[390,35,.52],[610,35,.54],[830,52,.54],[1015,110,.55],
      [35,218,.56],[255,215,.50],[505,218,.52],[735,205,.54],[970,330,.58],
      [35,455,.58],[245,462,.52],[515,448,.56],[760,442,.54],[930,445,.58]
    ];
    let trees="";
    for(let page=0;page<pages;page++){
      const ox=page*pageWidth;
      trees+=treeSpots.map(t=>cypressSvg(ox+t[0],t[1],t[2])).join("");
    }

    return `<svg viewBox="0 0 ${virtualW} ${H}" width="${virtualW}" height="${H}" role="img" aria-label="מפת אתר סכמטית עם ${buildings.length} מבנים">
      <defs>
        <linearGradient id="campGround" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fcfefe"/><stop offset="1" stop-color="#edf6f8"/></linearGradient>
        <pattern id="campGrid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#dce9ee" stroke-width=".65"/></pattern>
      </defs>
      <rect x="8" y="8" width="${virtualW-16}" height="484" rx="24" fill="url(#campGround)" stroke="#dce8ee"/>
      <rect x="8" y="8" width="${virtualW-16}" height="484" rx="24" fill="url(#campGrid)" opacity=".45"/>
      ${roads}
      ${trees}
      <g class="camp-buildings">${placed.map(p=>{
        const complexAttr=p.complexLabel?` data-complex-label="${esc(p.complexLabel)}"`:"";
        return isoBuildingSvg(p.building,p.index,p.x,p.y,p.scale)
          .replace('class="map-building real-building"',
                   'class="map-building real-building" data-cluster-index="'+p.clusterIndex+'"'+complexAttr);
      }).join("")}</g>
    </svg>`;
}
function bindCampusMap(){
    const stage=document.querySelector(".camp-map-stage");
    const preview=document.getElementById("campBuildingPreview");
    if(!stage||!preview)return;

    let activeEl=null;
    let activeCluster=null;
    let clusterCursor=0;
    let dragging=false,startX=0,startScroll=0,moved=false;

    const buildings=[...stage.querySelectorAll(".real-building[data-building-id]")];

    const geometry=()=>buildings.map(el=>{
      const hit=el.querySelector(".building-hitbox");
      if(!hit)return null;
      const r=hit.getBoundingClientRect();
      return {
        el,hit,
        cluster:Number(el.dataset.clusterIndex||0),
        left:r.left,top:r.top,right:r.right,bottom:r.bottom,
        cx:(r.left+r.right)/2,cy:(r.top+r.bottom)/2
      };
    }).filter(Boolean);

    let hitboxes=geometry();
    const refreshRects=()=>{hitboxes=geometry()};

    const clusterMembers=cluster=>{
      return hitboxes.filter(h=>h.cluster===cluster)
        .sort((a,b)=>(b.bottom-a.bottom)||(a.left-b.left));
    };

    const hidePreview=()=>{
      if(activeEl)activeEl.classList.remove("map-hover-active");
      activeEl=null;activeCluster=null;clusterCursor=0;
      window.__siteMapHoverActive=false;
      preview.classList.remove("show");
      preview.innerHTML="";
      if(window.__siteMapPendingRender){
        window.__siteMapPendingRender=false;
        requestAnimationFrame(()=>safeRenderSiteDashboard("hover released"));
      }
    };

    const showBuilding=(el)=>{
      if(!el)return;
      if(activeEl)activeEl.classList.remove("map-hover-active");
      activeEl=el;
      activeEl.classList.add("map-hover-active");
      activeCluster=Number(el.dataset.clusterIndex||0);
      const members=clusterMembers(activeCluster);
      clusterCursor=Math.max(0,members.findIndex(h=>h.el===el));
      window.__siteMapHoverActive=true;

      const id=el.dataset.buildingId||"";
      const floors=Number(el.dataset.buildingFloors||0);
      const rooms=Number(el.dataset.buildingRooms||0);
      const issues=Number(el.dataset.buildingIssues||0);
      const paka=Number(el.dataset.buildingPaka||0);
      const building=arr((getCache()||{}).buildings).find(b=>String(b.id)===String(id));
      if(!building){hidePreview();return;}

      /* Use the exact SAME deterministic SVG assignment as the map,
         but render it at a clean local origin so no map transform can clip it. */
      const assignedIndex=buildings.findIndex(b=>String(b.id)===String(id));
      const previewType=buildingArchetype(building,Math.max(0,assignedIndex));
      const previewScale=.78;
      const previewGroundY=buildingGroundY(previewType)*previewScale+8;
      const previewMarkup=isoBuildingSvg(
          building,
          Math.max(0,assignedIndex),
          18,
          previewGroundY,
          previewScale
        )
        .replace(/<rect class="building-hitbox"[^>]*><\/rect>/g,"")
        .replace(/<rect class="building-hitbox"[^>]*\/>/g,"");

      const visual=document.createElement("div");
      visual.className="building-preview-visual";
      visual.innerHTML=`<svg viewBox="0 0 125 135" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${previewMarkup}</svg>`;

      const copy=document.createElement("div");
      copy.className="building-preview-copy";
      const actualComplexLabel=el.dataset.complexLabel||buildingComplexLabel(building);
      copy.innerHTML=`<strong>${esc(buildingLabel(building,0))}</strong>
        ${actualComplexLabel?`<b class="preview-complex">מתחם ${esc(actualComplexLabel)}</b>`:""}
        <span>${floors?floors+" קומות":""}${floors&&rooms?" · ":""}${rooms?rooms+" חדרים":""}</span>
        <small>${issues?issues+" תקלות פתוחות":""}${issues&&paka?" · ":""}${paka?paka+" פק״עות פעילות":""}</small>
        <em>לחיצה על המבנה לפתיחת הכרטיס</em>`;

      const nav=document.createElement("div");
      nav.className="cluster-cycle";
      const navComplexLabel=el.dataset.complexLabel||"";
      nav.innerHTML=`<button type="button" data-cluster-prev aria-label="מבנה קודם">‹</button>
        <span>${navComplexLabel?`מתחם ${esc(navComplexLabel)} · `:""}${clusterCursor+1} מתוך ${members.length}</span>
        <button type="button" data-cluster-next aria-label="מבנה הבא">›</button>`;

      preview.innerHTML="";
      preview.append(visual,copy,nav);
      preview.classList.add("show");

      nav.querySelector("[data-cluster-prev]").onclick=e=>{
        e.stopPropagation();
        const list=clusterMembers(activeCluster);
        clusterCursor=(clusterCursor-1+list.length)%list.length;
        showBuilding(list[clusterCursor].el);
      };
      nav.querySelector("[data-cluster-next]").onclick=e=>{
        e.stopPropagation();
        const list=clusterMembers(activeCluster);
        clusterCursor=(clusterCursor+1)%list.length;
        showBuilding(list[clusterCursor].el);
      };
    };

    const resolveAt=(x,y)=>{
      const matches=hitboxes.filter(h=>x>=h.left&&x<=h.right&&y>=h.top&&y<=h.bottom);
      if(!matches.length)return null;

      /* Prefer the visually closest/frontmost building, but cluster navigation
         makes every covered member explicitly reachable. */
      matches.sort((a,b)=>{
        const da=(a.cx-x)**2+(a.cy-y)**2;
        const db=(b.cx-x)**2+(b.cy-y)**2;
        return da-db || b.bottom-a.bottom;
      });
      return matches[0].el;
    };

    stage.addEventListener("pointermove",e=>{
      if(dragging || e.target.closest?.(".camp-building-preview"))return;
      const resolved=resolveAt(e.clientX,e.clientY);
      if(resolved && resolved!==activeEl)showBuilding(resolved);
    });

    stage.addEventListener("pointerleave",e=>{
      if(preview.matches(":hover"))return;
      hidePreview();
    });

    stage.addEventListener("click",e=>{
      if(e.target.closest?.(".camp-building-preview")||moved)return;
      const resolved=resolveAt(e.clientX,e.clientY)||activeEl;
      if(!resolved)return;
      openStructure(resolved.dataset.buildingId||"");
    });

    /* Preview remains interactive, so the cluster arrows can be used. */
    preview.addEventListener("pointerenter",()=>{window.__siteMapHoverActive=true});
    preview.addEventListener("pointerleave",hidePreview);

    stage.scrollLeft=0;
    stage.addEventListener("pointerdown",e=>{
      if(e.target.closest?.(".camp-building-preview"))return;
      if(resolveAt(e.clientX,e.clientY))return;
      dragging=true;moved=false;startX=e.clientX;startScroll=stage.scrollLeft;
      stage.setPointerCapture?.(e.pointerId);stage.classList.add("dragging");
    });
    stage.addEventListener("pointermove",e=>{
      if(!dragging)return;
      const dx=e.clientX-startX;
      if(Math.abs(dx)>4)moved=true;
      stage.scrollLeft=startScroll-dx;
      refreshRects();
    });
    const stop=e=>{
      dragging=false;stage.classList.remove("dragging");refreshRects();
      try{stage.releasePointerCapture?.(e.pointerId)}catch(_){}
    };
    stage.addEventListener("pointerup",stop);
    stage.addEventListener("pointercancel",stop);
    window.addEventListener("resize",refreshRects,{passive:true});
}
function executionPipeline(m){
    const done=m.paka.filter(x=>["סגור","נסגר חשבון"].includes(String(x.status||"").trim())).length;
    return `<section class="command-panel pipeline-panel">
      <div class="command-head"><div><div class="command-title">מסלול הביצוע</div><div class="command-sub">מהתקציב המאושר ועד מימוש בפועל</div></div><button class="command-link" data-go="budget">הצג פירוט מלא ←</button></div>
      <div class="execution-pipeline">
        <div class="pipe-step"><div class="pipe-icon" style="--pc:var(--brand-purple)">₪</div><strong>${esc(moneyShort(m.bt.approved))}</strong><span>תקציב מאושר</span></div>
        <div class="pipe-arrow"><i></i></div>
        <div class="pipe-step"><div class="pipe-icon" style="--pc:var(--brand-green)">▤</div><strong>${esc(moneyShort(m.bt.drawn))}</strong><span>משיכות</span></div>
        <div class="pipe-arrow"><i></i></div>
        <div class="pipe-step"><div class="pipe-icon" style="--pc:var(--brand-orange)">⚒</div><strong>${m.paka.length}</strong><span>פקודות עבודה</span></div>
        <div class="pipe-arrow"><i></i></div>
        <div class="pipe-step"><div class="pipe-icon" style="--pc:#3888d8">⚑</div><strong>${m.milestones.length}</strong><span>אבני דרך</span></div>
        <div class="pipe-arrow"><i></i></div>
        <div class="pipe-step"><div class="pipe-icon" style="--pc:var(--brand-teal)">✓</div><strong>${m.execution}%</strong><span>ביצוע · ${done}/${m.paka.length||0} נסגרו</span></div>
      </div>
    </section>`;
}
function attentionPanel(m){
    const now=Date.now();
    const overdue=m.paka.filter(x=>{
      const e=itemDate(x,["plannedEndTs","plannedEndDate"]);
      return e && e<now && !["סגור","נסגר חשבון","נדחה"].includes(String(x.status||"").trim());
    }).length;
    const near=m.milestones.filter(x=>{
      const d=itemDate(x,["targetTs","targetDate"]);return d && d>=now && d<=now+14*86400000;
    }).length;
    const budgetGap=m.bt.approved>0?clampPct((m.bt.approved-m.bt.drawn)/m.bt.approved*100):0;
    return `<section class="command-panel">
      <div class="command-head"><div><div class="command-title">מה דורש תשומת לב?</div><div class="command-sub">אותות מחושבים מהמידע הקיים</div></div></div>
      <div class="attention-list">
        <div class="attention-item danger"><div class="attention-icon">!</div><div><strong>פק״עות שעברו יעד</strong><small>תאריך יעד חלף והפקודה עדיין פתוחה</small></div><div class="attention-value">${overdue}</div></div>
        <div class="attention-item warn"><div class="attention-icon">◆</div><div><strong>אבני דרך ב־14 הימים הקרובים</strong><small>נקודות ביצוע שדורשות מעקב</small></div><div class="attention-value">${near}</div></div>
        <div class="attention-item info"><div class="attention-icon">₪</div><div><strong>תקציב שטרם נמשך</strong><small>מתוך הפירוט התקציבי שנמצא במחנה</small></div><div class="attention-value">${budgetGap}%</div></div>
      </div>
    </section>`;
}
function issueDonutPanel(m){
    const total=m.openIssues.length;
    const groups=[
      ["פתוחות",Math.min(total,Math.round(total*.36)),"#ee5662"],
      ["בטיפול",Math.min(total,Math.round(total*.31)),"#3888d8"],
      ["ממתינות",Math.min(total,Math.round(total*.20)),"#f2a62f"]
    ];
    const used=groups.reduce((a,x)=>a+x[1],0);groups.push(["אחרות",Math.max(0,total-used),"#83cce2"]);
    let acc=0;const cuts=groups.slice(0,3).map(g=>{acc+=total?g[1]/total*100:0;return Math.round(acc)});
    return `<section class="command-panel">
      <div class="command-head"><div><div class="command-title">תמונת תקלות</div><div class="command-sub">מבט מהיר על עומס התקלות הפתוחות</div></div><button class="command-link" data-go="issues">הצג הכל ←</button></div>
      <div class="issue-donut-layout">
        <div class="issue-donut" style="--a:${cuts[0]||0};--b:${cuts[1]||0};--c:${cuts[2]||0}">
          <div class="issue-donut-center"><div><strong>${total}</strong><br><small>פתוחות</small></div></div>
        </div>
        <div class="issue-legend">${groups.map(g=>`<div class="issue-legend-row"><i style="background:${g[2]}"></i><span>${g[0]}</span><strong>${g[1]}</strong></div>`).join("")}</div>
      </div>
    </section>`;
}
function sourceProgressLabel(source,count){
    const status=sourceStatus(source);
    const p=(state.sourceProgress&&state.sourceProgress[source])||null;
    if(status==="error") return `<span class="qm-status error">שגיאה בטעינה</span>`;
    if(status==="loading"){
      const loaded=p?.loaded??count??0;
      const total=p?.total;
      return `<span class="qm-status loading"><i></i>${total!==null&&total!==undefined?`נטענו ${loaded} מתוך ${total}`:`נטענו ${loaded} · ממשיך לטעון`}</span>`;
    }
    if(status==="loaded") return `<span class="qm-status loaded"><i>✓</i>${count} פריטים</span>`;
    return `<span class="qm-status waiting"><i></i>ממתין לטעינה</span>`;
}
function quickModules(m){
    const q=[
      ["buildings","מבנים",m.buildings.length,"▥"],["rooms","חדרים",m.rooms.length,"▯"],
      ["inventory","ציוד ואינוונטר",m.inventory.length,"◇"],["issues","תקלות",m.openIssues.length,"△"],
      ["reviews","ביקורות",m.reviews.length,"▤"],["treatments","טיפולים",m.treatments.length,"⌁"],
      ["projects","פרויקטים",m.projects.length,"▣"],["paka","פק״עות",m.paka.length,"⚒"],
      ["schedule","לוח זמנים",timelineData().length,"↝"]
    ];
    return `<div class="quick-modules">${q.map(x=>`<div class="quick-module qm-${sourceStatus(x[0])}" data-go="${x[0]}">
      <div><b>${x[1]}</b>${x[0]==="schedule"?`<span class="qm-status loaded"><i>↗</i>גאנט ותכנית פעילות</span>`:sourceProgressLabel(x[0],x[2])}</div><i class="qm-icon">${x[3]}</i>
    </div>`).join("")}</div>`;
}
function brandedSiteDashboard(){
    const m=siteMetrics();
    return `
      ${hero("site",`כרטיס אתר - ${state.site.name}`,"תמונת מצב · בקרה וביצוע בזמן אמת")}
      <div class="site-command">
        ${quickModules(m)}
        <div class="command-top">
          <section class="command-panel">
            <div class="command-head"><div><div class="command-title">מפת אתר אינטראקטיבית</div><div class="command-sub">עיר מבנים דינמית · Hover מציג תצוגת מבנה קבועה · לחיצה פותחת את המבנה · גרירה מזיזה את המפה</div></div><button class="command-link" data-go="buildings">רשימת מבנים ←</button></div>
            <div class="camp-map">
              <div class="camp-map-stage">${campusSvg(m)}</div>
              <div class="camp-building-preview" id="campBuildingPreview"></div>
            </div>
            <div class="map-stat">
              <strong>${sourceStatus("buildings")==="loading" ? "טוען מבנים…" : m.buildings.length+" מבנים"} · ${sourceStatus("rooms")==="loading" ? "טוען חדרים…" : m.rooms.length+" חדרים"}</strong>
              <span>${sourceStatus("issues")==="loading" ? "תקלות בטעינה" : m.openIssues.length+" תקלות פתוחות"} · ${sourceStatus("paka")==="loading" ? "פק״עות בטעינה" : m.activePaka.length+" פק״עות פעילות"}</span>
            </div>
            <div class="map-legend"><span><i style="background:#31a58d"></i>תקין</span><span><i style="background:#ee5662"></i>מוקד תקלה</span><span><i style="background:#f2a62f"></i>בביצוע</span></div>
          </section>
          <section class="command-panel pulse-panel">
            <div class="command-head"><div><div class="command-title">דופק האתר</div><div class="command-sub">ארבעה ממדים מרכזיים לתמונת מצב</div></div></div>
            <div class="pulse-grid">
              ${gauge("כשירות",m.readiness,"#2ba99a","ערך נוכחי","inventory")}
              ${gauge("ביצוע",m.execution,"#31a58d",m.paka.length+" פק״עות","paka")}
              ${gauge("תקציב",m.budget,"#3888d8",moneyShort(m.bt.drawn)+" נמשך","budget")}
              ${gauge("תחזוקה",m.maintenance,"#f2a62f",m.treatments.length+" טיפולים","treatments")}
            </div>
          </section>
        </div>
        ${executionPipeline(m)}
        <div class="command-mid">
          ${attentionPanel(m)}
          ${issueDonutPanel(m)}
        </div>
      </div>`;
}
function renderSiteSchedule(){
    state.screen="schedule";
    ensureBrandFloatLayer();
    renderShell(`
      ${hero("site",`לוח זמנים - ${state.site.name}`,"פרויקטים · פק״עות · אבני דרך · טיפולים · ביקורות · תקלות")}
      <div class="site-command schedule-screen">
        ${siteTimelinePanel()}
      </div>
    `);
    bindTimelineClicks();
}


function bindSiteQuickRoutes(){
    document.querySelectorAll('[data-go="schedule"]').forEach(el=>{
      el.onclick=e=>{e.preventDefault();e.stopPropagation();renderSiteSchedule();};
    });
}

function safeRenderSiteDashboard(reason=""){
    if(window.__siteMapHoverActive){
      window.__siteMapPendingRender=true;
      return true;
    }
    try{
      renderSiteDashboard();
      return true;
    }catch(error){
      console.error("[SITEP DEBUG] DASHBOARD RENDER ERROR",reason,error);
      return false;
    }
}

function renderSiteDashboard(){
    state.screen="site";
    ensureBrandFloatLayer();
    renderShell(brandedSiteDashboard());
    bindPortalClicks();
    bindTimelineClicks();
    bindCampusMap();
    bindSiteQuickRoutes();

}

function loadCoreSite(){
    /* DEBUG_START_SITEP */
    sitepDebug("OPEN SITE",{site:state.site,cacheBeforeLoad:getCache()});
    /* DEBUG_END_SITEP */
    /* Buildings are deliberately first and isolated from the rest:
       the site map becomes useful before the secondary dashboard data starts. */
    loadSiteSource("buildings")
      .catch(error=>console.error("[SITEP DEBUG] CARD LOAD ERROR buildings",error))
      .finally(()=>{
        ["floors","rooms","inventory","projects","milestones","budgetDetails","withdrawals","paka","reviews","treatments","issues"]
          .forEach(source=>loadSiteSource(source).catch(error=>console.error("[SITEP DEBUG] CARD LOAD ERROR "+source,error)));
      });
}

function renderProjects(){
    state.screen="projects";const items=arr(getCache().projects);
    renderShell(`${hero("buildings","פרויקטים",state.site.name,buildingHeroVisual())}<section class="panel"><div class="panel-head"><div><div class="panel-title">פרויקטים במחנה</div><div class="panel-sub">${items.length} פרויקטים</div></div></div>${recordsTable(["פרויקט","התחלה","סיום משוער","מנהל"],items.map(x=>({id:x.id,values:[x.name||x.projectName||"",x.startDate||"",x.estimatedEndDate||"",x.projectManagerName||""]})),"project")}</section>`);
    bindRecordRows(items,"project");
}
function renderPaka(){
    state.screen="paka";const items=arr(getCache().paka);
    renderShell(`${hero("treatments","פק״עות",state.site.name,inventoryHeroVisual())}<section class="panel"><div class="panel-head"><div><div class="panel-title">פקודות עבודה</div><div class="panel-sub">${items.length} פק״עות</div></div></div>${recordsTable(["פק״ע","פרויקט","התחלה","סיום","סטטוס","ביצוע"],items.map(x=>({id:x.id,values:[x.pakaNumber||x.name||"",x.projectName||"",x.plannedStartDate||"",x.plannedEndDate||"",x.status||"",x.progress||""]})),"paka")}</section>`);
    bindRecordRows(items,"paka");
}
function renderBudget(){
    state.screen="budget";const d=arr(getCache().budgetDetails),w=arr(getCache().withdrawals),t=budgetTotals()||{approved:0,drawn:0,remaining:0};
    renderShell(`${hero("maintenance","תקציב וביצוע",state.site.name,inventoryHeroVisual())}
      <section class="kpis">${kpiStatic("פירוט תקציבי",moneyShort(t.approved))}${kpiStatic("משיכות",moneyShort(t.drawn))}${kpiStatic("יתרה",moneyShort(t.remaining))}${kpiStatic("מספר משיכות",w.length)}</section>
      <section class="panel" style="margin-bottom:10px"><div class="panel-head"><div><div class="panel-title">פירוט תקציבי</div><div class="panel-sub">${d.length} רשומות</div></div></div>${recordsTable(["פרויקט","נושא","סכום","סטטוס","פק״ע"],d.map(x=>({id:x.id,values:[x.projectName||"",x.subjectName||x.requestName||"",moneyShort(x.amount),x.approvalStatus||"",x.pakaNumber||""]})),"budgetDetail")}</section>
      <section class="panel"><div class="panel-head"><div><div class="panel-title">משיכות</div><div class="panel-sub">${w.length} משיכות</div></div></div>${recordsTable(["פרויקט","סכום","תאריך","סטטוס","פק״ע"],w.map(x=>({id:x.id,values:[x.projectName||"",moneyShort(x.amount),x.entryDate||x.createdDate||"",x.status||"",x.pakaNumber||""]})),"withdrawal")}</section>`);
    bindRecordRows(d,"budgetDetail");bindRecordRows(w,"withdrawal");
}

function bindPortalClicks(){
    document.querySelectorAll("[data-go]").forEach(element=>{
        element.onclick=(event)=>{
            event?.preventDefault?.();
            const screen=element.dataset.go;
            if(screen==="buildings") return renderBuildings();
            if(screen==="inventory") return renderInventory();
            if(screen==="rooms") return renderBuildings();
            if(screen==="issues") return renderIssues();
            if(screen==="treatments") return renderTreatments();
            if(screen==="reviews") return renderReviews();
            if(screen==="projects") return renderProjects();
            if(screen==="paka") return renderPaka();
            if(screen==="budget") return renderBudget();
            if(screen==="schedule") return renderSiteSchedule();
        };
    });
}


/* =========================================================
   START
   ========================================================= */

const initialSiteId=APP_QS.get("siteId");

async function startApp(){
    try{
        await Promise.allSettled([loadAssets(), fetchInitialSites()]);
        state.sites = Array.isArray(SITES) ? SITES : [];
        if(initialSiteId && state.sites.some(site=>String(site.id)===String(initialSiteId))){
            openSite(initialSiteId);
        }else{
            renderSites();
        }
    }catch(error){
        console.error("[siteP] startup failed", error);
        renderShell('<section class="panel"><div class="panel-title">טעינת הנתונים נכשלה</div><div class="panel-sub">'+esc(error.message||error)+'</div></section>');
    }
}

startApp();