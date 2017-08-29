/**
 * Copyright (c) 2015-2017 OpenMediaVault Plugin Developers
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// require("js/omv/workspace/window/Form.js")
// require("js/omv/Rpc.js")
// require("js/omv/module/admin/service/docker/PortRow.js")
// require("js/omv/module/admin/service/docker/EnvVarRow.js")
// require("js/omv/module/admin/service/docker/BindMountRow.js")
// require("js/omv/module/admin/service/docker/VolumesFromRow.js")

Ext.define("OMV.module.admin.service.docker.RunContainer", {
    extend: "OMV.workspace.window.Form",
    requires: [
        "OMV.module.admin.service.docker.PortRow",
        "OMV.module.admin.service.docker.EnvVarRow",
        "OMV.module.admin.service.docker.BindMountRow",
    ],

    title: _("Run container"),
    layout: "fit",
    width: 650,
    maxHeight: 700,
    closable: true,
    resizable: true,
    buttonAlign: "center",
    okButtonText: _("Run"),
    resetButtonText: _("Show Command"),
    buttonAlign: "center",
    grow: true,

    rpcService   : "Docker",
    rpcSetMethod : "runContainer",

    //Some variables that are used
    ports: [],
    envvars: [],
    restartpolicy: "No",
    privileged: false,
    networkmode: "Bridge",
    macvlan_network: "",
    macvlan_ipaddress: "",
    portbindings: [],
    cenvvars: [],
    bindmounts: [],
    volumes: [],
    maxretries: "",
    copyVolumes: [],
    hostname: "",
    timesync: true,
    imagevolumes: [],
    extraargs: "",
    action: "",
    cid: "",
    what: "",
    name: "",

    initComponent: function() {
        var me = this;
        if (me.action === "modify") {
            me.rpcSetMethod = "modifyContainer";
        }

        //Initiate counters used to create id's
        me.portCount = 1;
        me.envCount = 1;
        me.bindCount = 1;
        me.volCount = 1;

        me.portForwards = [];
        me.envVars = [];
        me.bindMounts = [];
        me.volumes = [];


        me.volFromStore = Ext.create("Ext.data.Store", {
            fields: [
                { name: "name", type: "string" }
            ],
        });

        me.callParent(arguments);
    },

    getFormItems : function() {
        var me = this;
        var items = [];

        //Add general fieldset
        var restartModes = Ext.create('Ext.data.Store', {
            fields: ['policy'],
            data : [
                {"policy": "no"},
                {"policy": "always"},
                {"policy": "unless-stopped"},
                {"policy": "on-failure"}
            ]
        });

        items.push({
            xtype: "fieldset",
            title: _("General"),
            items: [{
                xtype: "textfield",
                fieldLabel: _("Docker image"),
                value: me.image,
                readOnly: true,
                name: "image",
                id: "dockerImageName"
            },{
                xtype: "textfield",
                fieldLabel: _("Container name"),
                name: "containerName"
            },{
                xtype: "checkbox",
                name: "timeSync",
                boxLabel: _("Sync time with host")
            },{
                xtype: "combo",
                name: "restartpolicy",
                store: restartModes,
                fieldLabel: _("Restart Policy"),
                displayField: 'policy',
                valueField: 'policy',
                queryMode: 'local',
                value: "No",
                allowBlank: false,
                editable: false,
                listeners: {
                    scope: me,
                    change: function(textfield, newValue, oldValue, eOpts) {
                        var maxretries = me.getForm().findField("maxretries");
                        if(newValue === "on-failure" ) {
                            maxretries.setHidden(false);
                            maxretries.setDisabled(false);
                        } else {
                            maxretries.setHidden(true);
                            maxretries.setDisabled(true);
                        }
                    }
                }
            },{
                xtype: "numberfield",
                fieldLabel: _("Number of retries for on-failure mode"),
                name: "maxretries",
                hidden: true,
                disabled: true
            },{
                xtype: "checkbox",
                name: "privileged",
                boxLabel: _("Run container in privileged mode")
            }]
        });

        //Create data store for network mode selection
        var networkModes = Ext.create('Ext.data.Store', {
            fields: ['mode'],
            data : [
                {"mode": "Bridge"},
                {"mode": "Host"},
                {"mode": "None"},
                {"mode": "Macvlan"}
            ]
        });

        //Create data store for selection of exposed network ports
        //by the image
        var exposedPorts = Ext.create('Ext.data.Store', {
            fields: ['name']
        });
        exposedPorts.loadData(me.ports);

        //Add networking fieldset
        items.push({
            xtype: "fieldset",
            title: _("Networking"),
            collapsible: true,
            items: [{
                xtype: "combo",
                store: networkModes,
                fieldLabel: _("Network mode"),
                queryMode: 'local',
                displayField: 'mode',
                valueField: 'mode',
                value: "Bridged",
                editable: false,
                name: "networkMode",
                listeners: {
                    scope: me,
                    change: function(combo, newValue, oldValue, eOpts) {
                        var portField = me.queryById("dockerPortForward");
                        var macvlansettingsField = me.queryById("macvlansettings");
                        var hostNameField = me.getForm().findField("hostName");
                        if(newValue === "Host" || newValue === "None") {
                            macvlansettingsField.setHidden(true);
                            macvlansettingsField.setDisabled(true);
                            portField.setHidden(true);
                            portField.setDisabled(true);
                            hostNameField.setHidden(true);
                            hostNameField.setDisabled(true);
                        }  else if(newValue == "Macvlan" ) {
                            macvlansettingsField.setHidden(false);
                            macvlansettingsField.setDisabled(false);
                            portField.setHidden(true);
                            portField.setDisabled(true);
                            hostNameField.setHidden(false);
                            hostNameField.setDisabled(false);
                        } else {
                            macvlansettingsField.setHidden(true);
                            macvlansettingsField.setDisabled(true);
                            portField.setHidden(false);
                            portField.setDisabled(false);
                            hostNameField.setHidden(false);
                            hostNameField.setDisabled(false);
                        }
                    }
                }
            },{
                xtype: "textfield",
                fieldLabel: _("Host name"),
                readOnly: false,
                name: "hostName"
            },{
                xtype: "fieldset",
                title: _("Port forwarding"),
                id: "dockerPortForward",
                padding: "0 10 10 10",
                items: [{
                    xtype: "container",
                    layout: "hbox",
                    shadow: false,
                    border: false,
                    defaultType: "container",
                    defaults: {
                        flex: 3
                    },
                    items: [{html: "<b>Host IP</b>"},
                        {html: "<b>Host Port</b>"},
                        {html: "<b>Exposed Port</b>"},
                        {html: "<b>Custom Port</b>"},
                        {html: "<b>Protocol</b>", flex: 2},
                        {html: " ", flex: 0, width: 48
                        }]
                },{
                    xtype: "module.admin.service.docker.portrow",
                    portCount: me.portCount,
                    id: "dockerPortForward-" + me.portCount,
                    exposedPorts: exposedPorts
                }]
            },{
                xtype: "fieldset",
                title: _("Macvlan settings"),
                id: "macvlansettings",
                hidden: true,
                disabled: true,
                padding: "0 10 10 10",
                items: [{
                    xtype: "combo",
                    fieldLabel: _("Select macvlan network"),
                    name: "macvlan_network",
                    queryMode: "local",
                    displayField: 'description',
                    emptyText: _("Select a macvlan network ..."),
                    store: Ext.create("OMV.data.Store", {
                        autoLoad: true,
                        model: OMV.data.Model.createImplicit({
                            fields: [
                                { name: "name", type: "string" },
                                { name: "description", type: "string" }
                            ]
                        }),
                        proxy: {
                            type: "rpc",
                            rpcData: {
                                service: "Docker",
                                method: "getMacVlan"
                            }
                        },
                    }),
                    valueField: "name",
                    allowBlank: false,
                    forceSelection: true
                },{
                    xtype: "textfield",
                    fieldLabel: _("IP Address"),
                    name: "macvlan_ipaddress",
                    vtype: "IPv4",
                    allowBlank: true,
                    plugins: [{
                        ptype: "fieldinfo",
                        text: _("Please check the docker <a href='https://docs.docker.com/engine/userguide/networking/get-started-macvlan/' target='_blank'>macvlan documentation</a> for more details.")
                    }]
                }]
            }]
        });

        //Add environment variables fieldset
        items.push({
            xtype: "fieldset",
            title: _("Environment variables"),
            id: "dockerEnvVars",
            collapsible: true,
            collapsed: false,
            padding: "0 10 10 10",
            items: [{
                xtype: "container",
                layout: "hbox",
                shadow: false,
                border: false,
                defaultType: "container",
                items: [{html: "<b>Name</b>", flex: 1},
                    {html: "<b>Value</b>", flex: 2},
                    {html: " ", flex: 0, width: 48
                    }]
            }]
        });

        //Add bind mounts fieldset
        items.push({
            xtype: "fieldset",
            title: _("Volumes and Bind mounts"),
            id: "dockerBindMounts",
            collapsible: true,
            padding: "0 10 10 10",
            items: [{
                xtype: "container",
                layout: "hbox",
                shadow: false,
                border: false,
                defaultType: "container",
                items: [{html: "Note that if the \"Container path\" field is left blank a new data volume will be created", flex: 1
                }]
            },{
                xtype: "container",
                layout: "hbox",
                shadow: false,
                border: false,
                defaultType: "container",
                items: [{html: "<b>Host path</b>", flex: 6},
                    {html: "<b>Container path</b>", flex: 6},
                    {html: "<b>R/O</b>", flex: 1},
                    {html: " ", flex: 0, width: 48
                    }]
            }]
        });

        //Add volumes from fieldset
        items.push({
            xtype: "fieldset",
            title: _("Volumes from"),
            id: "dockerVolumesFrom",
            collapsible: true,
            padding: "0 10 10 10",
            items: [{
                xtype: "container",
                layout: "hbox",
                shadow: false,
                border: false,
                defaultType: "container",
                items: [{html: "<b>From container</b>", flex: 1},
                    {html: " ", flex: 0, width: 48
                    }]
            }]
        });

        //Add extra arguments fieldset
        items.push({
            xtype: "fieldset",
            title: _("Extra arguments"),
            id: "dockerExtraArguments",
            collapsible: true,
            items: [{
                xtype: "textfield",
                fieldLabel: _("Extra args"),
                readOnly: false,
                name: "extraArgs",
                id: "dockerExtraArgs",
                value: me.extraargs
            }]
        });

        //Add hidden field that changes before rendering to allow sending of form
        //even if no (regular) form field is dirty.
        items.push({
            xtype: "hiddenfield",
            name: "makeDirty",
            value: "false",
            id: "dockerMakeDirty"
        });

        return items;

    },

    beforeRender: function() {
        var me = this;
        me.callParent(arguments);

        if (me.action === "modify") {
            me.getForm().findField("containerName").setValue(me.name);
        }

        //if(me.restartpolicy === "always") {
          //  me.getForm().findField("policy").setValue(always);
        //}
        me.getForm().findField("restartpolicy").setValue(me.restartpolicy);
        me.getForm().findField("maxretries").setValue(me.maxretries);
        me.getForm().findField("macvlan_network").setValue(me.macvlan_network);
        me.getForm().findField("macvlan_ipaddress").setValue(me.macvlan_ipaddress);
        me.getForm().findField("privileged").setValue(me.privileged);
        me.getForm().findField("timeSync").setValue(me.timesync);
        me.getForm().findField("networkMode").setValue(me.networkmode);
        me.getForm().findField("hostName").setValue(me.hostname);
        me.getForm().findField("extraArgs").setValue(me.extraargs);

        //Add any ports mapped in container
        var portFieldset = me.queryById("dockerPortForward");
        var exposedPorts = Ext.create('Ext.data.Store', {
            fields: ['name']
        });
        exposedPorts.loadData(me.ports);
        var tmpString;
        var portsObj = {};
        for (i = 0; i < me.ports.length; i++) {
            tmpString = me.ports[i].name;
            portsObj[tmpString] = "";
        }
        for (i = 0; i < me.portbindings.length; i++) {
            if(me.portbindings[i].containerportstring in portsObj) {
                portFieldset.add({
                    xtype: "module.admin.service.docker.portrow",
                    portCount: me.portCount,
                    id: "dockerPortForward-" + me.portCount,
                    exposedPorts: exposedPorts,
                    hostip: me.portbindings[i].hostip,
                    hostport: me.portbindings[i].hostport,
                    exposedport: me.portbindings[i].containerportstring,
                    proto: me.portbindings[i].proto
                });
            } else {
                portFieldset.add({
                    xtype: "module.admin.service.docker.portrow",
                    portCount: me.portCount,
                    id: "dockerPortForward-" + me.portCount,
                    exposedPorts: exposedPorts,
                    hostip: me.portbindings[i].hostip,
                    hostport: me.portbindings[i].hostport,
                    customport: me.portbindings[i].containerportnr,
                    proto: me.portbindings[i].proto
                });
            }
            me.queryById("portForwardAddButton-" + me.portCount).fireEvent("setNewRow");
        }
        //Add an empty port forwarding row
        portFieldset.add({
            xtype: "module.admin.service.docker.portrow",
            portCount: me.portCount,
            id: "dockerPortForward-" + me.portCount,
            exposedPorts: exposedPorts
        });

        //Add environment variables and an empty row
        var envVarsFieldset = me.queryById("dockerEnvVars");
        if(me.cenvvars.length === 0) {
            me.cenvvars = me.envvars;
        }
        var keys = Object.keys(me.cenvvars);
        for (i = 0; i < keys.length; i++) {
            tmpString = keys[i];
            if(tmpString in me.envvars) {
                envVarsFieldset.add({
                    xtype: "module.admin.service.docker.envvarrow",
                    envCount: me.envCount,
                    id: "envVarRow-" + me.envCount,
                    nameVal: tmpString,
                    valueVal: me.cenvvars[tmpString],
                    defaultVal: "true"
                });
            } else {
                envVarsFieldset.add({
                    xtype: "module.admin.service.docker.envvarrow",
                    envCount: me.envCount,
                    id: "envVarRow-" + me.envCount,
                    nameVal: tmpString,
                    valueVal: me.cenvvars[tmpString]
                });
            }
            me.queryById("envVarAddButton-" + me.envCount).fireEvent("setNewRow");
        }
        envVarsFieldset.add({
            xtype: "module.admin.service.docker.envvarrow",
            envCount: me.envCount,
            id: "envVarRow-" + me.envCount,
        });

        //Add bind mounts and an empty row
        var bindMountsFieldset = me.queryById("dockerBindMounts");
        for (i = 0; i < me.bindmounts.length; i++) {
            bindMountsFieldset.add({
                xtype: "module.admin.service.docker.bindmountrow",
                bindCount: me.bindCount,
                id: "bindMountRow-" + me.bindCount,
                from: me.bindmounts[i].from,
                to: me.bindmounts[i].to,
                imagevolumes: me.imagevolumes,
                mode: me.bindmounts[i].mode
            });
            me.queryById("bindMountAddButton-" + me.bindCount).fireEvent("setNewRow");
        }
        bindMountsFieldset.add({
            xtype: "module.admin.service.docker.bindmountrow",
            bindCount: me.bindCount,
            id: "bindMountRow-" + me.bindCount,
            imagevolumes: me.imagevolumes
        });

        //Add volumes from and empty row
        OMV.Rpc.request({
            scope: me,
            callback: function(id, success, response) {
                me.volFromStore.loadData(response);

                var volumesFromFieldset = me.queryById("dockerVolumesFrom");
                for (i = 0; i < me.copyVolumes.length; i++) {
                    volumesFromFieldset.add({
                        xtype: "module.admin.service.docker.volumesfromrow",
                        volCount: me.volCount,
                        id: "volumesFromRow-" + me.volCount,
                        from: me.copyVolumes[i].from,
                        volFromStore: me.volFromStore
                    });
                    me.queryById("volumesFromAddButton-" + me.volCount).fireEvent("setNewRow");
                }
                volumesFromFieldset.add({
                    xtype: "module.admin.service.docker.volumesfromrow",
                    volCount: me.volCount,
                    id: "volumesFromRow-" + me.volCount,
                    volFromStore: me.volFromStore
                });

            },
            relayErrors: false,
            rpcData: {
                service: "Docker",
                method: "getVolumesFrom",
            }
        });

        //Change the value of the hidden field to force sending
        //of data even though no form field has changed value
        Ext.getCmp("dockerMakeDirty").setValue("true");
    },

    doSubmit: function() {
        var me = this;
        var params = {
            image: me.getForm().findField("image").getValue(),
            restartpolicy: me.getForm().findField("restartpolicy").getValue(),
            maxretries: me.getForm().findField("maxretries").getValue(),
            macvlan_network: me.getForm().findField("macvlan_network").getValue(),
            macvlan_ipaddress: me.getForm().findField("macvlan_ipaddress").getValue(),
            privileged: me.getForm().findField("privileged").getValue(),
            networkMode: me.getForm().findField("networkMode").getValue(),
            portForwards: me.portForwards,
            envVars: me.envVars,
            bindMounts: me.bindMounts,
            containerName: me.getForm().findField("containerName").getValue(),
            volumes: me.volumes,
            extraArgs: me.getForm().findField("extraArgs").getValue(),
            hostName: me.getForm().findField("hostName").getValue(),
            timeSync: me.getForm().findField("timeSync").getValue(),
            what: "run",
            cid: me.cid
        };
        if(me.mode === "remote") {
            var rpcOptions = {
                scope: me,
                callback: me.onSubmit,
                relayErrors: true,
                rpcData: {
                    service: me.rpcService,
                    method: me.rpcSetMethod || "set",
                    params: params
                }
            };
            if(me.fireEvent("beforesubmit", me, rpcOptions) === false)
                return;
            // Display waiting dialog.
            me.mask(me.submitMsg);
            // Execute RPC.
            OMV.Rpc.request(rpcOptions);
        } else {
            var params = me.getRpcSetParams();
            me.fireEvent("submit", me, params);
            me.close();
        }
    },

    onSubmit: function(id, success, response) {
        var me = this;
        // Is this a long running RPC? If yes, then periodically check
        // if it is still running, otherwise we are finished here and
        // we can notify listeners and close the window.
        if(me.rpcSetPollStatus) {
            if(!success) {
                me.unmask();
                OMV.MessageBox.error(null, response);
                me.fireEvent("exception", me, response);
                return;
            }
            // Execute RPC.
            OMV.Rpc.request({
                scope: me,
                callback: me.onIsRunning,
                relayErrors: true,
                rpcData: {
                    service: "Exec",
                    method: "isRunning",
                    params: {
                        filename: response
                    }
                }
            });
        } else {
            me.unmask();
            if(success) {
                var values = me.getRpcSetParams();
                me.fireEvent("submit", me, values, response);
                me.close();
                if(response) {
                    OMV.MessageBox.show({
                        title: _("Modify operation failed"),
                        msg: _("Modify container failed with message: </br>" +
                               response["response"] + "</br>" +
                               "Reverted to old settings"),
                        scope: me,
                        buttons: Ext.Msg.OK
                    });
                }
                Ext.getCmp("dockerContainerGrid").doReload();
            } else {
                OMV.MessageBox.error(null, response);
                me.fireEvent("exception", me, response);
            }
        }
    },

    onResetButton: function() {
        var me = this;
        var params = {
            image: me.getForm().findField("image").getValue(),
            restartpolicy: me.getForm().findField("restartpolicy").getValue(),
            maxretries: me.getForm().findField("maxretries").getValue(),
            macvlan_network: me.getForm().findField("macvlan_network").getValue(),
            macvlan_ipaddress: me.getForm().findField("macvlan_ipaddress").getValue(),
            privileged: me.getForm().findField("privileged").getValue(),
            networkMode: me.getForm().findField("networkMode").getValue(),
            portForwards: me.portForwards,
            envVars: me.envVars,
            bindMounts: me.bindMounts,
            containerName: me.getForm().findField("containerName").getValue(),
            volumes: me.volumes,
            extraArgs: me.getForm().findField("extraArgs").getValue(),
            hostName: me.getForm().findField("hostName").getValue(),
            timeSync: me.getForm().findField("timeSync").getValue(),
            what: "showcmd",
            cid: me.cid
        };
        if(me.mode === "remote") {
            var rpcOptions = {
                scope: me,
                callback: me.onShowCmd,
                relayErrors: true,
                rpcData: {
                    service: me.rpcService,
                    method: me.rpcSetMethod || "set",
                    params: params
                }
            };
            if(me.fireEvent("beforesubmit", me, rpcOptions) === false)
                return;
            // Display waiting dialog.
            me.mask(me.submitMsg);
            // Execute RPC.
            OMV.Rpc.request(rpcOptions);
        } else {
            var params = me.getRpcSetParams();
            me.fireEvent("submit", me, params);
            me.close();
        }
    },

    onShowCmd: function(id, success, response) {
        var me = this;
        if(me.rpcSetPollStatus) {
            if(!success) {
                me.unmask();
                OMV.MessageBox.error(null, response);
                me.fireEvent("exception", me, response);
                return;
            }
            // Execute RPC.
            OMV.Rpc.request({
                scope: me,
                callback: me.onIsRunning,
                relayErrors: true,
                rpcData: {
                    service: "Exec",
                    method: "isRunning",
                    params: {
                        filename: response
                    }
                }
            });
        } else {
            me.unmask();
            if(success) {
                var values = me.getRpcSetParams();
                me.fireEvent("submit", me, values, response);
                if(response) {
                    /*Ext.MessageBox.show({
                        title: _("Full command line"),
                        msg: ("The command is:"),
                        prompt: true,
                        value: response,
                        defaultFocus: response,
                        buttons: Ext.Msg.OK
                    });*/
                Ext.create('Ext.window.Window', {
                    autoShow     : true,
                    width        : 700,
                    title        : 'Command line',
                    items        : [
                        {
                            xtype      : 'textfield',
                            fieldLabel : "Command Line",
                            width      : 650,
                            itemId     : 'cmd',
                            name       : 'cmd',
                            value      : response
                        }
                    ]
                });


                    }
            } else {
                OMV.MessageBox.error(null, response);
                me.fireEvent("exception", me, response);
            }
        }
    }




});


