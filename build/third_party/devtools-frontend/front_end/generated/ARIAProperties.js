export const config = {
    "attributes": [
        {
            "isGlobal": true,
            "name": "aria-actions",
            "preventedOnRoles": [
                "caption",
                "code",
                "definition",
                "deletion",
                "emphasis",
                "generic",
                "insertion",
                "mark",
                "paragraph",
                "strong",
                "subscript",
                "suggestion",
                "superscript",
                "term",
                "time"
            ],
            "type": "IDREF_list"
        },
        {
            "name": "aria-activedescendant",
            "supportedOnRoles": [
                "application",
                "combobox",
                "composite",
                "grid",
                "group",
                "listbox",
                "menu",
                "menubar",
                "radiogroup",
                "row",
                "searchbox",
                "select",
                "spinbutton",
                "tablist",
                "textbox",
                "toolbar",
                "tree",
                "treegrid"
            ],
            "type": "IDREF"
        },
        {
            "default": "false",
            "isGlobal": true,
            "name": "aria-atomic",
            "type": "boolean"
        },
        {
            "default": "none",
            "enum": [
                "inline",
                "list",
                "both",
                "none"
            ],
            "name": "aria-autocomplete",
            "supportedOnRoles": [
                "combobox",
                "searchbox",
                "textbox"
            ],
            "type": "token"
        },
        {
            "isGlobal": true,
            "name": "aria-braillelabel",
            "preventedOnRoles": [
                "caption",
                "code",
                "definition",
                "deletion",
                "emphasis",
                "generic",
                "insertion",
                "mark",
                "none",
                "paragraph",
                "strong",
                "subscript",
                "suggestion",
                "superscript",
                "term",
                "time"
            ],
            "type": "string"
        },
        {
            "isGlobal": true,
            "name": "aria-brailleroledescription",
            "preventedOnRoles": [
                "generic"
            ],
            "type": "string"
        },
        {
            "default": "false",
            "isGlobal": true,
            "name": "aria-busy",
            "type": "boolean"
        },
        {
            "default": "undefined",
            "enum": [
                "true",
                "false",
                "mixed",
                "undefined"
            ],
            "name": "aria-checked",
            "supportedOnRoles": [
                "checkbox",
                "menuitemcheckbox",
                "menuitemradio",
                "option",
                "radio",
                "switch",
                "treeitem"
            ],
            "type": "token"
        },
        {
            "name": "aria-colcount",
            "supportedOnRoles": [
                "grid",
                "table",
                "treegrid"
            ],
            "type": "integer"
        },
        {
            "name": "aria-colindex",
            "supportedOnRoles": [
                "cell",
                "columnheader",
                "gridcell",
                "row",
                "rowheader"
            ],
            "type": "integer"
        },
        {
            "name": "aria-colindextext",
            "supportedOnRoles": [
                "cell",
                "columnheader",
                "gridcell",
                "rowheader"
            ],
            "type": "string"
        },
        {
            "name": "aria-colspan",
            "supportedOnRoles": [
                "cell",
                "columnheader",
                "rowheader"
            ],
            "type": "integer"
        },
        {
            "isGlobal": true,
            "name": "aria-controls",
            "type": "IDREF_list"
        },
        {
            "default": "false",
            "enum": [
                "page",
                "step",
                "location",
                "date",
                "time",
                "true",
                "false"
            ],
            "isGlobal": true,
            "name": "aria-current",
            "type": "token"
        },
        {
            "isGlobal": true,
            "name": "aria-describedby",
            "type": "IDREF_list"
        },
        {
            "isGlobal": true,
            "name": "aria-description",
            "type": "string"
        },
        {
            "isGlobal": true,
            "name": "aria-details",
            "type": "IDREF"
        },
        {
            "default": "false",
            "name": "aria-disabled",
            "supportedOnRoles": [
                "application",
                "button",
                "checkbox",
                "columnheader",
                "combobox",
                "composite",
                "grid",
                "gridcell",
                "group",
                "input",
                "link",
                "listbox",
                "menu",
                "menubar",
                "menuitem",
                "menuitemcheckbox",
                "menuitemradio",
                "option",
                "radio",
                "radiogroup",
                "row",
                "rowheader",
                "scrollbar",
                "searchbox",
                "select",
                "separator",
                "slider",
                "spinbutton",
                "switch",
                "tab",
                "tablist",
                "textbox",
                "toolbar",
                "tree",
                "treegrid",
                "treeitem"
            ],
            "type": "boolean"
        },
        {
            "name": "aria-errormessage",
            "supportedOnRoles": [
                "application",
                "checkbox",
                "columnheader",
                "combobox",
                "gridcell",
                "listbox",
                "radiogroup",
                "rowheader",
                "searchbox",
                "slider",
                "spinbutton",
                "switch",
                "textbox",
                "tree",
                "treegrid"
            ],
            "type": "IDREF"
        },
        {
            "default": "undefined",
            "enum": [
                "true",
                "false",
                "undefined"
            ],
            "name": "aria-expanded",
            "supportedOnRoles": [
                "application",
                "button",
                "checkbox",
                "columnheader",
                "combobox",
                "gridcell",
                "link",
                "menuitem",
                "menuitemcheckbox",
                "menuitemradio",
                "row",
                "rowheader",
                "switch",
                "tab",
                "treeitem"
            ],
            "type": "token"
        },
        {
            "isGlobal": true,
            "name": "aria-flowto",
            "type": "IDREF_list"
        },
        {
            "default": "false",
            "enum": [
                "false",
                "true",
                "menu",
                "listbox",
                "tree",
                "grid",
                "dialog"
            ],
            "name": "aria-haspopup",
            "supportedOnRoles": [
                "application",
                "button",
                "columnheader",
                "combobox",
                "gridcell",
                "link",
                "menuitem",
                "menuitemcheckbox",
                "menuitemradio",
                "rowheader",
                "searchbox",
                "slider",
                "tab",
                "textbox",
                "treeitem"
            ],
            "type": "token"
        },
        {
            "default": "undefined",
            "enum": [
                "true",
                "false",
                "undefined"
            ],
            "isGlobal": true,
            "name": "aria-hidden",
            "type": "token"
        },
        {
            "default": "false",
            "enum": [
                "grammar",
                "false",
                "spelling",
                "true"
            ],
            "name": "aria-invalid",
            "supportedOnRoles": [
                "application",
                "checkbox",
                "columnheader",
                "combobox",
                "gridcell",
                "listbox",
                "radiogroup",
                "rowheader",
                "searchbox",
                "slider",
                "spinbutton",
                "switch",
                "textbox",
                "tree",
                "treegrid"
            ],
            "type": "token"
        },
        {
            "isGlobal": true,
            "name": "aria-keyshortcuts",
            "type": "string"
        },
        {
            "isGlobal": true,
            "name": "aria-label",
            "preventedOnRoles": [
                "caption",
                "code",
                "definition",
                "deletion",
                "emphasis",
                "generic",
                "insertion",
                "mark",
                "none",
                "paragraph",
                "strong",
                "subscript",
                "suggestion",
                "superscript",
                "term",
                "time"
            ],
            "type": "string"
        },
        {
            "isGlobal": true,
            "name": "aria-labelledby",
            "preventedOnRoles": [
                "caption",
                "code",
                "definition",
                "deletion",
                "emphasis",
                "generic",
                "insertion",
                "mark",
                "none",
                "paragraph",
                "strong",
                "subscript",
                "suggestion",
                "superscript",
                "term",
                "time"
            ],
            "type": "IDREF_list"
        },
        {
            "isGlobal": true,
            "name": "aria-labeledby",
            "preventedOnRoles": [
                "caption",
                "code",
                "definition",
                "deletion",
                "emphasis",
                "generic",
                "insertion",
                "mark",
                "none",
                "paragraph",
                "strong",
                "subscript",
                "suggestion",
                "superscript",
                "term",
                "time"
            ],
            "type": "IDREF_list"
        },
        {
            "name": "aria-level",
            "supportedOnRoles": [
                "comment",
                "heading",
                "row",
                "treeitem"
            ],
            "type": "integer"
        },
        {
            "default": "undefined",
            "enum": [
                "off",
                "polite",
                "assertive",
                "undefined"
            ],
            "isGlobal": true,
            "name": "aria-live",
            "type": "token"
        },
        {
            "default": "false",
            "name": "aria-modal",
            "supportedOnRoles": [
                "alertdialog",
                "dialog"
            ],
            "type": "boolean"
        },
        {
            "default": "false",
            "name": "aria-multiline",
            "supportedOnRoles": [
                "searchbox",
                "textbox"
            ],
            "type": "boolean"
        },
        {
            "default": "false",
            "name": "aria-multiselectable",
            "supportedOnRoles": [
                "grid",
                "listbox",
                "tablist",
                "tree",
                "treegrid"
            ],
            "type": "boolean"
        },
        {
            "default": "undefined",
            "enum": [
                "horizontal",
                "undefined",
                "vertical"
            ],
            "name": "aria-orientation",
            "supportedOnRoles": [
                "listbox",
                "menu",
                "menubar",
                "radiogroup",
                "scrollbar",
                "select",
                "separator",
                "slider",
                "tablist",
                "toolbar",
                "tree",
                "treegrid"
            ],
            "type": "token"
        },
        {
            "isGlobal": true,
            "name": "aria-owns",
            "type": "IDREF_list"
        },
        {
            "name": "aria-placeholder",
            "supportedOnRoles": [
                "searchbox",
                "textbox"
            ],
            "type": "string"
        },
        {
            "name": "aria-posinset",
            "supportedOnRoles": [
                "article",
                "comment",
                "listitem",
                "menuitem",
                "menuitemcheckbox",
                "menuitemradio",
                "option",
                "radio",
                "row",
                "tab",
                "treeitem"
            ],
            "type": "integer"
        },
        {
            "default": "undefined",
            "enum": [
                "true",
                "false",
                "mixed",
                "undefined"
            ],
            "name": "aria-pressed",
            "supportedOnRoles": [
                "button"
            ],
            "type": "token"
        },
        {
            "default": "false",
            "name": "aria-readonly",
            "supportedOnRoles": [
                "checkbox",
                "columnheader",
                "combobox",
                "grid",
                "gridcell",
                "listbox",
                "radiogroup",
                "rowheader",
                "searchbox",
                "slider",
                "spinbutton",
                "switch",
                "textbox",
                "treegrid"
            ],
            "type": "boolean"
        },
        {
            "default": "additions text",
            "enum": [
                "additions",
                "removals",
                "text",
                "all"
            ],
            "isGlobal": true,
            "name": "aria-relevant",
            "type": "token_list"
        },
        {
            "default": "false",
            "name": "aria-required",
            "supportedOnRoles": [
                "checkbox",
                "columnheader",
                "combobox",
                "gridcell",
                "listbox",
                "radiogroup",
                "rowheader",
                "searchbox",
                "spinbutton",
                "switch",
                "textbox",
                "tree",
                "treegrid"
            ],
            "type": "boolean"
        },
        {
            "isGlobal": true,
            "name": "aria-roledescription",
            "preventedOnRoles": [
                "generic"
            ],
            "type": "string"
        },
        {
            "name": "aria-rowcount",
            "supportedOnRoles": [
                "grid",
                "table",
                "treegrid"
            ],
            "type": "integer"
        },
        {
            "name": "aria-rowindex",
            "supportedOnRoles": [
                "cell",
                "columnheader",
                "gridcell",
                "row",
                "rowheader"
            ],
            "type": "integer"
        },
        {
            "name": "aria-rowindextext",
            "supportedOnRoles": [
                "cell",
                "columnheader",
                "gridcell",
                "row",
                "rowheader"
            ],
            "type": "string"
        },
        {
            "name": "aria-rowspan",
            "supportedOnRoles": [
                "cell",
                "columnheader",
                "rowheader"
            ],
            "type": "integer"
        },
        {
            "default": "undefined",
            "enum": [
                "true",
                "false",
                "undefined"
            ],
            "name": "aria-selected",
            "supportedOnRoles": [
                "columnheader",
                "gridcell",
                "option",
                "row",
                "rowheader",
                "tab",
                "treeitem"
            ],
            "type": "token"
        },
        {
            "name": "aria-setsize",
            "supportedOnRoles": [
                "article",
                "comment",
                "listitem",
                "menuitem",
                "menuitemcheckbox",
                "menuitemradio",
                "option",
                "radio",
                "row",
                "tab",
                "treeitem"
            ],
            "type": "integer"
        },
        {
            "default": "none",
            "enum": [
                "ascending",
                "descending",
                "none",
                "other"
            ],
            "name": "aria-sort",
            "supportedOnRoles": [
                "columnheader",
                "rowheader"
            ],
            "type": "token"
        },
        {
            "name": "aria-valuemax",
            "supportedOnRoles": [
                "meter",
                "progressbar",
                "scrollbar",
                "separator",
                "slider",
                "spinbutton"
            ],
            "type": "decimal"
        },
        {
            "name": "aria-valuemin",
            "supportedOnRoles": [
                "meter",
                "progressbar",
                "scrollbar",
                "separator",
                "slider",
                "spinbutton"
            ],
            "type": "decimal"
        },
        {
            "name": "aria-valuenow",
            "supportedOnRoles": [
                "meter",
                "progressbar",
                "scrollbar",
                "separator",
                "slider",
                "spinbutton"
            ],
            "type": "decimal"
        },
        {
            "name": "aria-valuetext",
            "supportedOnRoles": [
                "meter",
                "progressbar",
                "scrollbar",
                "separator",
                "slider",
                "spinbutton"
            ],
            "type": "string"
        }
    ],
    "metadata": {
        "attrsNullNamespace": true,
        "export": "CORE_EXPORT",
        "namespace": "HTML",
        "namespacePrefix": "xhtml",
        "namespaceURI": "http://www.w3.org/1999/xhtml"
    },
    "roles": [
        {
            "implicitValues": {
                "aria-atomic": "true",
                "aria-live": "assertive"
            },
            "name": "alert",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kAlertDialog"
            ],
            "name": "alertdialog",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "alert",
                "dialog"
            ]
        },
        {
            "name": "application",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "article",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "document"
            ]
        },
        {
            "internalRoles": [
                "kBanner",
                "kHeader"
            ],
            "name": "banner",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "name": "blockquote",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "childrenPresentational": true,
            "internalRoles": [
                "kButton",
                "kToggleButton",
                "kPopUpButton"
            ],
            "name": "button",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "command"
            ]
        },
        {
            "name": "caption",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "cell",
            "nameFrom": [
                "contents",
                "author"
            ],
            "scope": "row",
            "superclasses": [
                "section"
            ]
        },
        {
            "implicitValues": {
                "aria-checked": false
            },
            "internalRoles": [
                "kCheckBox"
            ],
            "name": "checkbox",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "requiredAttributes": [
                "aria-checked"
            ],
            "superclasses": [
                "input"
            ]
        },
        {
            "name": "code",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "internalRoles": [
                "kColumnHeader"
            ],
            "name": "columnheader",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "scope": [
                "row"
            ],
            "superclasses": [
                "gridcell",
                "sectionhead",
                "widget"
            ]
        },
        {
            "implicitValues": {
                "aria-expanded": "false",
                "aria-haspopup": "listbox"
            },
            "internalRoles": [
                "kComboBoxGrouping",
                "kComboBoxMenuButton",
                "kComboBoxSelect",
                "kTextFieldWithComboBox"
            ],
            "mustContain": [
                "textbox"
            ],
            "name": "combobox",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "requiredAttributes": [
                "aria-controls",
                "aria-expanded"
            ],
            "superclasses": [
                "select"
            ]
        },
        {
            "name": "comment",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "abstract": true,
            "name": "command",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "widget"
            ]
        },
        {
            "name": "complementary",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "abstract": true,
            "name": "composite",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "widget"
            ]
        },
        {
            "internalRoles": [
                "kContentInfo",
                "kFooter"
            ],
            "name": "contentinfo",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "name": "definition",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kContentDeletion"
            ],
            "name": "deletion",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "dialog",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "window"
            ]
        },
        {
            "deprecated": true,
            "internalRoles": [
                "kList"
            ],
            "name": "directory",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "list"
            ]
        },
        {
            "name": "document",
            "nameFrom": [
                "author"
            ],
            "nameRequired": false,
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "emphasis",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "mustContain": [
                "article"
            ],
            "name": "feed",
            "nameFrom": [
                "author"
            ],
            "nameRequired": false,
            "superclasses": [
                "list"
            ]
        },
        {
            "name": "figure",
            "nameFrom": [
                "author"
            ],
            "nameRequired": false,
            "superclasses": [
                "section"
            ]
        },
        {
            "name": "form",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kGenericContainer",
                "kSectionWithoutName"
            ],
            "name": "generic",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "mustContain": [
                "row"
            ],
            "name": "grid",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "composite",
                "table"
            ]
        },
        {
            "internalRoles": [
                "kGridCell"
            ],
            "name": "gridcell",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "scope": [
                "row"
            ],
            "superclasses": [
                "cell",
                "widget"
            ]
        },
        {
            "internalRoles": [
                "kGroup",
                "kDetails"
            ],
            "name": "group",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "implicitValues": {
                "aria-level": "2"
            },
            "name": "heading",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "sectionhead"
            ]
        },
        {
            "internalRoles": [
                "kImage"
            ],
            "name": "image",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "childrenPresentational": true,
            "deprecated": true,
            "internalRoles": [
                "kImage"
            ],
            "name": "img",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kContentInsertion"
            ],
            "name": "insertion",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "abstract": true,
            "name": "input",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "widget"
            ]
        },
        {
            "abstract": true,
            "name": "landmark",
            "nameFrom": [
                "author"
            ],
            "nameRequired": false,
            "superclasses": [
                "section"
            ]
        },
        {
            "name": "link",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "command"
            ]
        },
        {
            "implicitValues": {
                "aria-orientation": "vertical"
            },
            "internalRoles": [
                "kList"
            ],
            "mustContain": [
                "listitem"
            ],
            "name": "list",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "implicitValues": {
                "aria-orientation": "vertical"
            },
            "internalRoles": [
                "kListBox"
            ],
            "mustContain": [
                "option"
            ],
            "name": "listbox",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "select"
            ]
        },
        {
            "internalRoles": [
                "kListItem"
            ],
            "name": "listitem",
            "nameFrom": [
                "author"
            ],
            "scope": [
                "group",
                "list"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "implicitValues": {
                "aria-live": "polite"
            },
            "name": "log",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "section"
            ]
        },
        {
            "name": "main",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "name": "mark",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "marquee",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "section"
            ]
        },
        {
            "childrenPresentational": true,
            "name": "math",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "section"
            ]
        },
        {
            "implicitValues": {
                "aria-orientation": "vertical"
            },
            "mustContain": [
                "group",
                "menuitemradio",
                "menuitem",
                "menuitemcheckbox",
                "menuitemradio"
            ],
            "name": "menu",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "select"
            ]
        },
        {
            "implicitValues": {
                "aria-orientation": "horizontal"
            },
            "internalRoles": [
                "kMenuBar"
            ],
            "mustContain": [
                "menuitem",
                "menuitemradio",
                "menuitemcheckbox"
            ],
            "name": "menubar",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "menu"
            ]
        },
        {
            "internalRoles": [
                "kMenuItem"
            ],
            "name": "menuitem",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "scope": [
                "group",
                "menu",
                "menubar"
            ],
            "superclasses": [
                "command"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-checked": false
            },
            "internalRoles": [
                "kMenuItemCheckBox"
            ],
            "name": "menuitemcheckbox",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "scope": [
                "menu",
                "menubar"
            ],
            "superclasses": [
                "checkbox",
                "menuitem"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-checked": false
            },
            "internalRoles": [
                "kMenuItemRadio"
            ],
            "name": "menuitemradio",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "scope": [
                "menu",
                "menubar",
                "group"
            ],
            "superclasses": [
                "menuitemcheckbox",
                "radio"
            ]
        },
        {
            "implicitValues": {
                "aria-valuemax": "100",
                "aria-valuemin": "0"
            },
            "name": "meter",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "navigation",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kNone"
            ],
            "name": "none",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "note",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-selected": "false"
            },
            "internalRoles": [
                "kListBoxOption",
                "kMenuListOption"
            ],
            "name": "option",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "requiredAttributes": [
                "aria-selected"
            ],
            "scope": [
                "listbox"
            ],
            "superclasses": [
                "input"
            ]
        },
        {
            "name": "paragraph",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "deprecated": true,
            "internalRoles": [
                "kNone"
            ],
            "name": "presentation",
            "superclasses": [
                "structure"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-valuemax": "100",
                "aria-valuemin": "0"
            },
            "internalRoles": [
                "kProgressIndicator"
            ],
            "name": "progressbar",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "range"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-checked": "false"
            },
            "internalRoles": [
                "kRadioButton"
            ],
            "name": "radio",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "requiredAttributes": [
                "aria-checked"
            ],
            "superclasses": [
                "input"
            ]
        },
        {
            "internalRoles": [
                "kRadioGroup"
            ],
            "mustContain": [
                "radio"
            ],
            "name": "radiogroup",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "select"
            ]
        },
        {
            "abstract": true,
            "name": "range",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "widget"
            ]
        },
        {
            "name": "region",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "landmark"
            ]
        },
        {
            "abstract": true,
            "name": "roletype"
        },
        {
            "mustContain": [
                "cell",
                "columnheader",
                "gridcell",
                "rowheader"
            ],
            "name": "row",
            "nameFrom": [
                "contents",
                "author"
            ],
            "scope": [
                "grid",
                "rowgroup",
                "table",
                "treegrid"
            ],
            "superclasses": [
                "group",
                "widget"
            ]
        },
        {
            "internalRoles": [
                "kRowGroup"
            ],
            "mustContain": [
                "row"
            ],
            "name": "rowgroup",
            "nameFrom": [
                "author"
            ],
            "scope": [
                "grid",
                "table",
                "treegrid"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "internalRoles": [
                "kRowHeader"
            ],
            "name": "rowheader",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "scope": [
                "row"
            ],
            "superclasses": [
                "cell",
                "gridcell",
                "sectionhead"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-orientation": "vertical",
                "aria-valuemax": "100",
                "aria-valuemin": "0"
            },
            "internalRoles": [
                "kScrollBar"
            ],
            "name": "scrollbar",
            "nameFrom": [
                "author"
            ],
            "nameRequired": false,
            "requiredAttributes": [
                "aria-controls",
                "aria-orientation",
                "aria-valuemax",
                "aria-valuemin",
                "aria-valuenow"
            ],
            "superclasses": [
                "range"
            ]
        },
        {
            "name": "search",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kSearchBox"
            ],
            "name": "searchbox",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "textbox"
            ]
        },
        {
            "abstract": true,
            "name": "section",
            "superclasses": [
                "structure"
            ]
        },
        {
            "abstract": true,
            "name": "sectionhead",
            "nameFrom": [
                "contents",
                "author"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "abstract": true,
            "name": "select",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "composite",
                "group"
            ]
        },
        {
            "implicitValues": {
                "aria-orientation": "horizontal",
                "aria-valuemax": "100",
                "aria-valuemin": "0"
            },
            "internalRoles": [
                "kSplitter"
            ],
            "name": "separator",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-orientation": "horizontal",
                "aria-valuemax": "100",
                "aria-valuemin": "0"
            },
            "name": "slider",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "requiredAttributes": [
                "aria-valuemax",
                "aria-valuemin",
                "aria-valuenow"
            ],
            "superclasses": [
                "input",
                "range"
            ]
        },
        {
            "internalRoles": [
                "kSpinButton"
            ],
            "name": "spinbutton",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "requiredAttributes": [
                "aria-valuemax",
                "aria-valuemin",
                "aria-valuenow"
            ],
            "superclasses": [
                "composite",
                "input",
                "range"
            ]
        },
        {
            "implicitValues": {
                "aria-atomic": "true",
                "aria-live": "polite"
            },
            "name": "status",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "name": "strong",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "abstract": true,
            "name": "structure",
            "superclasses": [
                "roletype"
            ]
        },
        {
            "name": "subscript",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "suggestion",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "name": "superscript",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-checked": "false"
            },
            "name": "switch",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "requiredAttributes": [
                "aria-checked"
            ],
            "superclasses": [
                "checkbox"
            ]
        },
        {
            "childrenPresentational": true,
            "implicitValues": {
                "aria-selected": "false"
            },
            "name": "tab",
            "nameFrom": [
                "contents",
                "author"
            ],
            "scope": [
                "tablist"
            ],
            "superclasses": [
                "sectionhead",
                "widget"
            ]
        },
        {
            "mustContain": [
                "row"
            ],
            "name": "table",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "section"
            ]
        },
        {
            "implicitValues": {
                "aria-orientation": "horizontal"
            },
            "internalRoles": [
                "kTabList"
            ],
            "mustContain": [
                "tab"
            ],
            "name": "tablist",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "composite"
            ]
        },
        {
            "internalRoles": [
                "kTabPanel"
            ],
            "name": "tabpanel",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "section"
            ]
        },
        {
            "name": "term",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "name": "time",
            "nameFrom": [
                "prohibited"
            ],
            "superclasses": [
                "structure"
            ]
        },
        {
            "internalRoles": [
                "kTextField"
            ],
            "name": "textbox",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "input"
            ]
        },
        {
            "name": "timer",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "status"
            ]
        },
        {
            "implicitValues": {
                "aria-orientation": "horizontal"
            },
            "name": "toolbar",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "group"
            ]
        },
        {
            "name": "tooltip",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "section"
            ]
        },
        {
            "implicitValues": {
                "aria-orientation": "vertical"
            },
            "mustContain": [
                "group",
                "treeitem"
            ],
            "name": "tree",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "select"
            ]
        },
        {
            "internalRoles": [
                "kTreeGrid"
            ],
            "mustContain": [
                "row"
            ],
            "name": "treegrid",
            "nameFrom": [
                "author"
            ],
            "nameRequired": true,
            "superclasses": [
                "grid",
                "tree"
            ]
        },
        {
            "internalRoles": [
                "kTreeItem"
            ],
            "name": "treeitem",
            "nameFrom": [
                "contents",
                "author"
            ],
            "nameRequired": true,
            "scope": [
                "group",
                "tree"
            ],
            "superclasses": [
                "listitem",
                "option"
            ]
        },
        {
            "abstract": true,
            "name": "widget",
            "superclasses": [
                "roletype"
            ]
        },
        {
            "abstract": true,
            "name": "window",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "roletype"
            ]
        },
        {
            "internalRoles": [
                "kSectionFooter"
            ],
            "name": "sectionfooter",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "contentinfo"
            ]
        },
        {
            "internalRoles": [
                "kSectionHeader"
            ],
            "name": "sectionheader",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "banner"
            ]
        },
        {
            "internalRoles": [
                "kDocAbstract"
            ],
            "name": "doc-abstract",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocAcknowledgments"
            ],
            "name": "doc-acknowledgments",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocAfterword"
            ],
            "name": "doc-afterword",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocAppendix"
            ],
            "name": "doc-appendix",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocBackLink"
            ],
            "name": "doc-backlink",
            "nameFrom": [
                "contents",
                "author"
            ],
            "superclasses": [
                "link"
            ]
        },
        {
            "internalRoles": [
                "kDocBiblioEntry"
            ],
            "name": "doc-biblioentry",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "listitem"
            ]
        },
        {
            "internalRoles": [
                "kDocBibliography"
            ],
            "name": "doc-bibliography",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocBiblioRef"
            ],
            "name": "doc-biblioref",
            "nameFrom": [
                "contents",
                "author"
            ],
            "superclasses": [
                "link"
            ]
        },
        {
            "internalRoles": [
                "kDocChapter"
            ],
            "name": "doc-chapter",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocColophon"
            ],
            "name": "doc-colophon",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocConclusion"
            ],
            "name": "doc-conclusion",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocCover"
            ],
            "name": "doc-cover",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "img"
            ]
        },
        {
            "internalRoles": [
                "kDocCredit"
            ],
            "name": "doc-credit",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocCredits"
            ],
            "name": "doc-credits",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocDedication"
            ],
            "name": "doc-dedication",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocEndnote"
            ],
            "name": "doc-endnote",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "listitem"
            ]
        },
        {
            "internalRoles": [
                "kDocEndnotes"
            ],
            "name": "doc-endnotes",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocEpigraph"
            ],
            "name": "doc-epigraph",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocEpilogue"
            ],
            "name": "doc-epilogue",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocErrata"
            ],
            "name": "doc-errata",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocExample"
            ],
            "name": "doc-example",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocFootnote"
            ],
            "name": "doc-footnote",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocForeword"
            ],
            "name": "doc-foreword",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocGlossary"
            ],
            "name": "doc-glossary",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocGlossRef"
            ],
            "name": "doc-glossref",
            "nameFrom": [
                "contents",
                "author"
            ],
            "superclasses": [
                "link"
            ]
        },
        {
            "internalRoles": [
                "kDocIndex"
            ],
            "name": "doc-index",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "navigation"
            ]
        },
        {
            "internalRoles": [
                "kDocIntroduction"
            ],
            "name": "doc-introduction",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocNoteRef"
            ],
            "name": "doc-noteref",
            "nameFrom": [
                "contents",
                "author"
            ],
            "superclasses": [
                "link"
            ]
        },
        {
            "internalRoles": [
                "kDocNotice"
            ],
            "name": "doc-notice",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "note"
            ]
        },
        {
            "internalRoles": [
                "kDocPageBreak"
            ],
            "name": "doc-pagebreak",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "separator"
            ]
        },
        {
            "internalRoles": [
                "kDocPageFooter"
            ],
            "name": "doc-pagefooter",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "contentinfo"
            ]
        },
        {
            "internalRoles": [
                "kDocPageHeader"
            ],
            "name": "doc-pageheader",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "banner"
            ]
        },
        {
            "internalRoles": [
                "kDocPageList"
            ],
            "name": "doc-pagelist",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "navigation"
            ]
        },
        {
            "internalRoles": [
                "kDocPart"
            ],
            "name": "doc-part",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocPreface"
            ],
            "name": "doc-preface",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocPrologue"
            ],
            "name": "doc-prologue",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "landmark"
            ]
        },
        {
            "internalRoles": [
                "kDocPullquote"
            ],
            "name": "doc-pullquote",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocQna"
            ],
            "name": "doc-qna",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "section"
            ]
        },
        {
            "internalRoles": [
                "kDocSubtitle"
            ],
            "name": "doc-subtitle",
            "nameFrom": [
                "contents",
                "author"
            ],
            "superclasses": [
                "sectionhead"
            ]
        },
        {
            "internalRoles": [
                "kDocTip"
            ],
            "name": "doc-tip",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "note"
            ]
        },
        {
            "internalRoles": [
                "kDocToc"
            ],
            "name": "doc-toc",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "navigation"
            ]
        },
        {
            "internalRoles": [
                "kGraphicsDocument"
            ],
            "name": "graphics-document",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "document"
            ]
        },
        {
            "internalRoles": [
                "kGraphicsObject"
            ],
            "name": "graphics-object",
            "nameFrom": [
                "contents",
                "author"
            ],
            "superclasses": [
                "group"
            ]
        },
        {
            "internalRoles": [
                "kGraphicsSymbol"
            ],
            "name": "graphics-symbol",
            "nameFrom": [
                "author"
            ],
            "superclasses": [
                "img"
            ]
        }
    ]
};
//# sourceMappingURL=ARIAProperties.js.map