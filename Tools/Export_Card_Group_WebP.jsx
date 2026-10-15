#target photoshop
app.bringToFront();

(function () {
    if (!app.documents.length) { alert('Open your card PSD first.'); return; }
    var doc = app.activeDocument;
    var group = doc.activeLayer;
    if (group.typename !== 'LayerSet') {
        alert('Select the CARD GROUP (folder) in the Layers panel, then run again.');
        return;
    }
    var output = Folder.selectDialog('Choose a folder for the WebP cards');
    if (!output) return;

    // Photoshop 2026: native WebP Save As uses Action Manager.
    function saveWebP(file) {
        var desc = new ActionDescriptor();
        var webp = new ActionDescriptor();
        webp.putEnumerated(stringIDToTypeID('compression'), stringIDToTypeID('WebPCompression'), stringIDToTypeID('compressionLossy'));
        webp.putInteger(stringIDToTypeID('quality'), 90);
        webp.putBoolean(stringIDToTypeID('includeXMPData'), false);
        webp.putBoolean(stringIDToTypeID('includeEXIFData'), false);
        webp.putBoolean(stringIDToTypeID('includePsExtras'), false);
        desc.putObject(charIDToTypeID('As  '), stringIDToTypeID('WebPFormat'), webp);
        desc.putPath(charIDToTypeID('In  '), file);
        desc.putBoolean(charIDToTypeID('Cpy '), true);
        desc.putBoolean(charIDToTypeID('LwCs'), true);
        executeAction(charIDToTypeID('save'), desc, DialogModes.NO);
    }

    var cards = [];
    for (var i = group.layers.length - 1; i >= 0; i--) {
        if (group.layers[i].typename === 'ArtLayer') cards.push(group.layers[i]);
    }
    if (!cards.length) { alert('No direct card layers found in the selected group.'); return; }

    var originalVisibility = [];
    for (var j = 0; j < group.layers.length; j++) originalVisibility.push(group.layers[j].visible);
    var originalActive = doc.activeLayer;
    var exported = 0;
    var failed = [];
    try {
        // Hide all direct layers; the group mask remains active.
        for (var k = 0; k < group.layers.length; k++) group.layers[k].visible = false;
        for (var n = 0; n < cards.length; n++) {
            var layer = cards[n];
            try {
                layer.visible = true;
                doc.activeLayer = layer;
                var safeName = layer.name.replace(/[\\\/:*?"<>|]/g, '_');
                var file = new File(output.fsName + '/' + safeName + '.webp');
                // Duplicate the composited document so WebP save never alters the source PSD.
                var temp = doc.duplicate('Temporary Card Export', false);
                try {
                    app.activeDocument = temp;
                    if (temp.mode !== DocumentMode.RGB) temp.changeMode(ChangeMode.RGB);
                    if (temp.bitsPerChannel !== BitsPerChannelType.EIGHT) temp.bitsPerChannel = BitsPerChannelType.EIGHT;
                    saveWebP(file);
                    exported++;
                } finally {
                    temp.close(SaveOptions.DONOTSAVECHANGES);
                    app.activeDocument = doc;
                }
            } catch (e) {
                failed.push(layer.name + ': ' + e.message);
            } finally {
                layer.visible = false;
            }
        }
    } finally {
        app.activeDocument = doc;
        for (var m = 0; m < group.layers.length; m++) group.layers[m].visible = originalVisibility[m];
        doc.activeLayer = originalActive;
    }
    alert('Exported ' + exported + ' of ' + cards.length + ' cards.' + (failed.length ? '\n\nErrors:\n' + failed.join('\n') : '') + '\n\nOutput: ' + output.fsName);
})();
