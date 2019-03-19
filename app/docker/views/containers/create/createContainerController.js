import _ from 'lodash-es';
import { ContainerCapabilities, ContainerCapability } from 'Docker/models/containerCapabilities';
import { AccessControlFormData } from 'Portainer/components/accessControlForm/porAccessControlFormModel';
import { ContainerDetailsViewModel } from 'Docker/models/container';
import { prepareCapabilities, addVolume } from './includes/prepares';


import angular from 'angular';

class CreateContainerController {
  /* @ngInject */
  constructor($q, $scope, $state, $timeout, $transition$, $filter, ContainerHelper, ImageHelper, VolumeService, NetworkService, ResourceControlService, Authentication, Notifications, ContainerService, ImageService, FormValidator, ModalService, RegistryService, SystemService, SettingsService, PluginService, HttpRequestHelper) {
    this.$q = $q;
    this.$scope = $scope; // TODO : Remove this temporary scope save for ApplicationState
    this.$state = $state;
    this.$timeout = $timeout;
    this.$transition$ = $transition$;
    this.$filter = $filter;
    this.ContainerHelper = ContainerHelper;
    this.ImageHelper = ImageHelper;
    this.HttpRequestHelper = HttpRequestHelper;
    this.VolumeService = VolumeService;
    this.NetworkService = NetworkService;
    this.ContainerService = ContainerService;
    this.ImageService = ImageService;
    this.RegistryService = RegistryService;
    this.ResourceControlService = ResourceControlService;
    this.SystemService = SystemService;
    this.SettingsService = SettingsService;
    this.PluginService = PluginService;
    this.Authentication = Authentication;
    this.Notifications = Notifications;
    this.FormValidator = FormValidator;
    this.ModalService = ModalService;

    this.formValues = {
      alwaysPull: true,
      Console: 'none',
      Volumes: [],
      NetworkContainer: '',
      Labels: [],
      ExtraHosts: [],
      MacAddress: '',
      IPv4: '',
      IPv6: '',
      AccessControlData: new AccessControlFormData(),
      CpuLimit: 0,
      MemoryLimit: 0,
      MemoryReservation: 0,
      NodeName: null,
      capabilities: [],
      LogDriverName: '',
      LogDriverOpts: []
    };

    this.extraNetworks = {};

    this.state = {
      formValidationError: '',
      actionInProgress: false
    };

    this.config = {
      Image: '',
      Env: [],
      Cmd: '',
      MacAddress: '',
      ExposedPorts: {},
      HostConfig: {
        RestartPolicy: {
          Name: 'no'
        },
        PortBindings: [],
        PublishAllPorts: false,
        Binds: [],
        AutoRemove: false,
        NetworkMode: 'bridge',
        Privileged: false,
        Runtime: '',
        ExtraHosts: [],
        Devices: [],
        CapAdd: [],
        CapDrop: []
      },
      NetworkingConfig: {
        EndpointsConfig: {}
      },
      Labels: {}
    };

    this.fromContainerMultipleNetworks = false;
    this.addVolume = addVolume;
  }

  refreshSlider() {
    this.$timeout(function () {
      this.$broadcast('rzSliderForceRender');
    });
  }

  // addVolume() {
  //   this.formValues.Volumes.push({ name: '', containerPath: '', readOnly: false, type: 'volume' });
  // }

  removeVolume(index) {
    this.formValues.Volumes.splice(index, 1);
  }

  addEnvironmentVariable() {
    this.config.Env.push({ name: '', value: ''});
  }

  removeEnvironmentVariable(index) {
    this.config.Env.splice(index, 1);
  }

  addPortBinding() {
    this.config.HostConfig.PortBindings.push({ hostPort: '', containerPort: '', protocol: 'tcp' });
  }

  removePortBinding(index) {
    this.config.HostConfig.PortBindings.splice(index, 1);
  }

  addLabel() {
    this.formValues.Labels.push({ name: '', value: ''});
  }

  removeLabel(index) {
    this.formValues.Labels.splice(index, 1);
  }

  addExtraHost() {
    this.formValues.ExtraHosts.push({ value: '' });
  }

  removeExtraHost(index) {
    this.formValues.ExtraHosts.splice(index, 1);
  }

  addDevice() {
    this.config.HostConfig.Devices.push({ pathOnHost: '', pathInContainer: '' });
  }

  removeDevice(index) {
    this.config.HostConfig.Devices.splice(index, 1);
  }

  addLogDriverOpt() {
    this.formValues.LogDriverOpts.push({ name: '', value: ''});
  }

  removeLogDriverOpt(index) {
    this.formValues.LogDriverOpts.splice(index, 1);
  }

  prepareImageConfig(config) {
    var image = config.Image;
    var registry = this.formValues.Registry;
    var imageConfig = this.ImageHelper.createImageConfigForContainer(image, registry.URL);
    config.Image = imageConfig.fromImage + ':' + imageConfig.tag;
    this.imageConfig = imageConfig;
  }

  preparePortBindings(config) {
    var bindings = {};
    for (const portBinding of config.HostConfig.PortBindings) {
      if (portBinding.containerPort) {
        var key = portBinding.containerPort + '/' + portBinding.protocol;
        var binding = {};
        if (portBinding.hostPort && portBinding.hostPort.indexOf(':') > -1) {
          var hostAndPort = portBinding.hostPort.split(':');
          binding.HostIp = hostAndPort[0];
          binding.HostPort = hostAndPort[1];
        } else {
          binding.HostPort = portBinding.hostPort;
        }
        bindings[key] = [binding];
        config.ExposedPorts[key] = {};
      }
    }
    config.HostConfig.PortBindings = bindings;
  }

  prepareConsole(config) {
    var value = this.formValues.Console;
    var openStdin = true;
    var tty = true;
    if (value === 'tty') {
      openStdin = false;
    } else if (value === 'interactive') {
      tty = false;
    } else if (value === 'none') {
      openStdin = false;
      tty = false;
    }
    config.OpenStdin = openStdin;
    config.Tty = tty;
  }

  prepareEnvironmentVariables(config) {
    var env = [];
    for (const v of config.Env) {
      if (v.name && v.value) {
        env.push(v.name + '=' + v.value);
      }
    }
    config.Env = env;
  }

  prepareVolumes(config) {
    var binds = [];
    var volumes = {};

    for (const volume of this.formValues.Volumes) {
      var name = volume.name;
      var containerPath = volume.containerPath;
      if (name && containerPath) {
        var bind = name + ':' + containerPath;
        volumes[containerPath] = {};
        if (volume.readOnly) {
          bind += ':ro';
        }
        binds.push(bind);
      }
    }
    config.HostConfig.Binds = binds;
    config.Volumes = volumes;
  }

  prepareNetworkConfig(config) {
    var mode = config.HostConfig.NetworkMode;
    var container = this.formValues.NetworkContainer;
    var containerName = container;
    if (container && typeof container === 'object') {
      containerName = this.$filter('trimcontainername')(container.Names[0]);
    }
    var networkMode = mode;
    if (containerName) {
      networkMode += ':' + containerName;
      config.Hostname = '';
    }
    config.HostConfig.NetworkMode = networkMode;
    config.MacAddress = this.formValues.MacAddress;

    config.NetworkingConfig.EndpointsConfig[networkMode] = {
      IPAMConfig: {
        IPv4Address: this.formValues.IPv4,
        IPv6Address: this.formValues.IPv6
      }
    };

    for (const v of this.formValues.ExtraHosts) {
      if (v.value) {
        config.HostConfig.ExtraHosts.push(v.value);
      }
    }
  }

  prepareLabels(config) {
    var labels = {};
    for (const label of this.formValues.Labels) {
      if (label.name && label.value) {
        labels[label.name] = label.value;
      }
    }
    config.Labels = labels;
  }

  prepareDevices(config) {
    var path = [];
    for (const p of config.HostConfig.Devices) {
      if (p.pathOnHost) {
        if(p.pathInContainer === '') {
          p.pathInContainer = p.pathOnHost;
        }
        path.push({PathOnHost:p.pathOnHost,PathInContainer:p.pathInContainer,CgroupPermissions:'rwm'});
      }
    }
    config.HostConfig.Devices = path;
  }

  prepareResources(config) {
    // Memory Limit - Round to 0.125
    var memoryLimit = (Math.round(this.formValues.MemoryLimit * 8) / 8).toFixed(3);
    memoryLimit *= 1024 * 1024;
    if (memoryLimit > 0) {
      config.HostConfig.Memory = memoryLimit;
    }
    // Memory Resevation - Round to 0.125
    var memoryReservation = (Math.round(this.formValues.MemoryReservation * 8) / 8).toFixed(3);
    memoryReservation *= 1024 * 1024;
    if (memoryReservation > 0) {
      config.HostConfig.MemoryReservation = memoryReservation;
    }
    // CPU Limit
    if (this.formValues.CpuLimit > 0) {
      config.HostConfig.NanoCpus = this.formValues.CpuLimit * 1000000000;
    }
  }

  prepareLogDriver(config) {
    var logOpts = {};
    if (this.formValues.LogDriverName) {
      config.HostConfig.LogConfig = { Type: this.formValues.LogDriverName };
      if (this.formValues.LogDriverName !== 'none') {
        for (const opt of this.formValues.LogDriverOpts) {
          if (opt.name) {
            logOpts[opt.name] = opt.value;
          }
        }
        if (Object.keys(logOpts).length !== 0 && logOpts.constructor === Object) {
          config.HostConfig.LogConfig.Config = logOpts;
        }
      }
    }
  }



  prepareConfiguration() {
    var config = angular.copy(this.config);
    config.Cmd = this.ContainerHelper.commandStringToArray(config.Cmd);
    this.prepareNetworkConfig(config);
    this.prepareImageConfig(config);
    this.preparePortBindings(config);
    this.prepareConsole(config);
    this.prepareEnvironmentVariables(config);
    this.prepareVolumes(config);
    this.prepareLabels(config);
    this.prepareDevices(config);
    this.prepareResources(config);
    this.prepareLogDriver(config);
    prepareCapabilities(config);
    return config;
  }

  loadFromContainerCmd() {
    if (this.config.Cmd) {
      this.config.Cmd = this.ContainerHelper.commandArrayToString(this.config.Cmd);
    } else {
      this.config.Cmd = '';
    }
  }

  loadFromContainerPortBindings() {
    var bindings = [];
    for (var p in this.config.HostConfig.PortBindings) {
      if ({}.hasOwnProperty.call(this.config.HostConfig.PortBindings, p)) {
        var hostPort = '';
        if (this.config.HostConfig.PortBindings[p][0].HostIp) {
          hostPort = this.config.HostConfig.PortBindings[p][0].HostIp + ':';
        }
        hostPort += this.config.HostConfig.PortBindings[p][0].HostPort;
        var b = {
          'hostPort': hostPort,
          'containerPort': p.split('/')[0],
          'protocol': p.split('/')[1]
        };
        bindings.push(b);
      }
    }
    this.config.HostConfig.PortBindings = bindings;
  }

  loadFromContainerVolumes(d) {
    for (var v in d.Mounts) {
      if ({}.hasOwnProperty.call(d.Mounts, v)) {
        var mount = d.Mounts[v];
        var volume = {
          'type': mount.Type,
          'name': mount.Name || mount.Source,
          'containerPath': mount.Destination,
          'readOnly': mount.RW === false
        };
        this.formValues.Volumes.push(volume);
      }
    }
  }

  resetNetworkConfig() {
    this.config.NetworkingConfig = {
      EndpointsConfig: {}
    };
  }

  loadFromContainerNetworkConfig(d) {
    this.config.NetworkingConfig = {
      EndpointsConfig: {}
    };
    var networkMode = d.HostConfig.NetworkMode;
    if (networkMode === 'default') {
      this.config.HostConfig.NetworkMode = 'bridge';
      if (!_.find(this.availableNetworks, {'Name': 'bridge'})) {
        this.config.HostConfig.NetworkMode = 'nat';
      }
    }
    if (this.config.HostConfig.NetworkMode.indexOf('container:') === 0) {
      var netContainer = this.config.HostConfig.NetworkMode.split(/^container:/)[1];
      this.config.HostConfig.NetworkMode = 'container';
      for (var c in this.runningContainers) {
        if (this.runningContainers[c].Names && this.runningContainers[c].Names[0] === '/' + netContainer) {
          this.formValues.NetworkContainer = this.runningContainers[c];
        }
      }
    }
    this.fromContainerMultipleNetworks = Object.keys(d.NetworkSettings.Networks).length >= 2;
    if (d.NetworkSettings.Networks[this.config.HostConfig.NetworkMode]) {
      if (d.NetworkSettings.Networks[this.config.HostConfig.NetworkMode].IPAMConfig) {
        if (d.NetworkSettings.Networks[this.config.HostConfig.NetworkMode].IPAMConfig.IPv4Address) {
          this.formValues.IPv4 = d.NetworkSettings.Networks[this.config.HostConfig.NetworkMode].IPAMConfig.IPv4Address;
        }
        if (d.NetworkSettings.Networks[this.config.HostConfig.NetworkMode].IPAMConfig.IPv6Address) {
          this.formValues.IPv6 = d.NetworkSettings.Networks[this.config.HostConfig.NetworkMode].IPAMConfig.IPv6Address;
        }
      }
    }
    this.config.NetworkingConfig.EndpointsConfig[this.config.HostConfig.NetworkMode] = d.NetworkSettings.Networks[this.config.HostConfig.NetworkMode];
    // Mac Address
    if(Object.keys(d.NetworkSettings.Networks).length) {
      var firstNetwork = d.NetworkSettings.Networks[Object.keys(d.NetworkSettings.Networks)[0]];
      this.formValues.MacAddress = firstNetwork.MacAddress;
      this.config.NetworkingConfig.EndpointsConfig[this.config.HostConfig.NetworkMode] = firstNetwork;
      this.extraNetworks = angular.copy(d.NetworkSettings.Networks);
      delete this.extraNetworks[Object.keys(d.NetworkSettings.Networks)[0]];
    } else {
      this.formValues.MacAddress = '';
    }

    // ExtraHosts
    if (this.config.HostConfig.ExtraHosts) {
      var extraHosts = this.config.HostConfig.ExtraHosts;
      for (var i = 0; i < extraHosts.length; i++) {
        var host = extraHosts[i];
        this.formValues.ExtraHosts.push({ 'value': host });
      }
      this.config.HostConfig.ExtraHosts = [];
    }
  }

  loadFromContainerEnvironmentVariables() {
    var envArr = [];
    for (var e in this.config.Env) {
      if ({}.hasOwnProperty.call(this.config.Env, e)) {
        var arr = this.config.Env[e].split(/\=(.+)/);
        envArr.push({'name': arr[0], 'value': arr[1]});
      }
    }
    this.config.Env = envArr;
  }

  loadFromContainerLabels() {
    for (var l in this.config.Labels) {
      if ({}.hasOwnProperty.call(this.config.Labels, l)) {
        this.formValues.Labels.push({ name: l, value: this.config.Labels[l]});
      }
    }
  }

  loadFromContainerConsole() {
    if (this.config.OpenStdin && this.config.Tty) {
      this.formValues.Console = 'both';
    } else if (!this.config.OpenStdin && this.config.Tty) {
      this.formValues.Console = 'tty';
    } else if (this.config.OpenStdin && !this.config.Tty) {
      this.formValues.Console = 'interactive';
    } else if (!this.config.OpenStdin && !this.config.Tty) {
      this.formValues.Console = 'none';
    }
  }

  loadFromContainerDevices() {
    var path = [];
    for (var dev in this.config.HostConfig.Devices) {
      if ({}.hasOwnProperty.call(this.config.HostConfig.Devices, dev)) {
        var device = this.config.HostConfig.Devices[dev];
        path.push({'pathOnHost': device.PathOnHost, 'pathInContainer': device.PathInContainer});
      }
    }
    this.config.HostConfig.Devices = path;
  }

  loadFromContainerImageConfig() {
    var imageInfo = this.ImageHelper.extractImageAndRegistryFromRepository(this.config.Image);
    this.RegistryService.retrieveRegistryFromRepository(this.config.Image)
    .then(function success(data) {
      if (data) {
        this.config.Image = imageInfo.image;
        this.formValues.Registry = data;
      }
    })
    .catch(function error(err) {
      this.Notifications.error('Failure', err, 'Unable to retrive registry');
    });
  }

  loadFromContainerResources(d) {
    if (d.HostConfig.NanoCpus) {
      this.formValues.CpuLimit = d.HostConfig.NanoCpus / 1000000000;
    }
    if (d.HostConfig.Memory) {
      this.formValues.MemoryLimit = d.HostConfig.Memory / 1024 / 1024;
    }
    if (d.HostConfig.MemoryReservation) {
      this.formValues.MemoryReservation = d.HostConfig.MemoryReservation / 1024 / 1024;
    }
  }

  loadFromContainerCapabilities(d) {
    if (d.HostConfig.CapAdd) {
      for (const cap of d.HostConfig.CapAdd) {
        this.formValues.capabilities.push(new ContainerCapability(cap, true));
      }
    }
    if (d.HostConfig.CapDrop) {
      for (const cap of d.HostConfig.CapDrop) {
        this.formValues.capabilities.push(new ContainerCapability(cap, false));
      }
    }

    var capabilities = new ContainerCapabilities();
    for (var i = 0; i < capabilities.length; i++) {
      var cap = capabilities[i];
      if (!_.find(this.formValues.capabilities, (item) => item.capability === cap.capability)) {
        this.formValues.capabilities.push(cap);
      }
    }

    this.formValues.capabilities.sort((a, b) => a.capability < b.capability ? -1 : 1);
  }

  loadFromContainerSpec() {
    // Get container
    this.Container.get({ id: this.$transition$.params().from }).$promise
    .then(function success(d) {
      var fromContainer = new ContainerDetailsViewModel(d);
      if (fromContainer.ResourceControl && fromContainer.ResourceControl.Public) {
        this.formValues.AccessControlData.AccessControlEnabled = false;
      }
      this.fromContainer = fromContainer;
      this.config = this.ContainerHelper.configFromContainer(fromContainer.Model);
      this.loadFromContainerCmd(d);
      this.loadFromContainerLogging(d);
      this.loadFromContainerPortBindings(d);
      this.loadFromContainerVolumes(d);
      this.loadFromContainerNetworkConfig(d);
      this.loadFromContainerEnvironmentVariables(d);
      this.loadFromContainerLabels(d);
      this.loadFromContainerConsole(d);
      this.loadFromContainerDevices(d);
      this.loadFromContainerImageConfig(d);
      this.loadFromContainerResources(d);
      this.loadFromContainerCapabilities(d);
    })
    .catch(function error(err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve container');
    });
  }

  loadFromContainerLogging(config) {
    var logConfig = config.HostConfig.LogConfig;
    this.formValues.LogDriverName = logConfig.Type;
    this.formValues.LogDriverOpts = _.map(logConfig.Config, function (value, name) {
      return {
        name: name,
        value: value
      };
    });
  }

  async $onInit() {
    var nodeName = this.$transition$.params().nodeName;
    this.formValues.NodeName = nodeName;
    this.HttpRequestHelper.setPortainerAgentTargetHeader(nodeName);
    try {
      let data = await this.VolumeService.volumes({});
      this.availableVolumes = data.Volumes;
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve volumes');
    }

    var provider = this.$scope.applicationState.endpoint.mode.provider;
    var apiVersion = this.$scope.applicationState.endpoint.apiVersion;
    try {
      let data = await this.NetworkService.networks(
        provider === 'DOCKER_STANDALONE' || provider === 'DOCKER_SWARM_MODE',
        false,
        provider === 'DOCKER_SWARM_MODE' && apiVersion >= 1.25
      );
      var networks = data;
      networks.push({ Name: 'container' });
      this.availableNetworks = networks;

      if (_.find(networks, {'Name': 'nat'})) {
        this.config.HostConfig.NetworkMode = 'nat';
      }
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve networks');
    }

    try {
      this.runningContainers = await this.ContainerService.containers();
      if (this.$transition$.params().from) {
        this.loadFromContainerSpec();
      } else {
        this.fromContainer = {};
        this.formValues.Registry = {};
        this.formValues.capabilities = new ContainerCapabilities();
      }
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve running containers');
    }

    try {
      let data = await this.SystemService.info();
      this.availableRuntimes = Object.keys(data.Runtimes);
      this.config.HostConfig.Runtime = '';
      this.state.sliderMaxCpu = 32;
      if (data.NCPU) {
        this.state.sliderMaxCpu = data.NCPU;
      }
      this.state.sliderMaxMemory = 32768;
      if (data.MemTotal) {
        this.state.sliderMaxMemory = Math.floor(data.MemTotal / 1000 / 1000);
      }
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve engine details');
    }


    try {
      let data = await this.SettingsService.publicSettings();
      this.allowBindMounts = data.AllowBindMountsForRegularUsers;
      this.allowPrivilegedMode = data.AllowPrivilegedModeForRegularUsers;
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve application settings');
    }

    try {
      this.availableLoggingDrivers = await this.PluginService.loggingPlugins(apiVersion < 1.25);
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to load logging plugins');
    }

    var userDetails = this.Authentication.getUserDetails();
    this.isAdmin = userDetails.role === 1;
  }

  validateForm(accessControlData, isAdmin) {
    this.state.formValidationError = '';
    var error = '';
    error = this.FormValidator.validateAccessControl(accessControlData, isAdmin);

    if (error) {
      this.state.formValidationError = error;
      return false;
    }
    return true;
  }


  create() {
    var oldContainer = null;

    this.HttpRequestHelper.setPortainerAgentTargetHeader(this.formValues.NodeName);
    return findCurrentContainer()
      .then(setOldContainer)
      .then(confirmCreateContainer)
      .then(startCreationProcess)
      .catch(notifyOnError)
      .finally(final);

    function final() {
      this.state.actionInProgress = false;
    }

    function setOldContainer(container) {
      oldContainer = container;
      return container;
    }

    function findCurrentContainer() {
      return this.ContainerService.containers(1, { name: ['^/' + this.config.name + '$'] } )
        .$promise
        .then(function onQuerySuccess(containers) {
          if (!containers.length) {
            return;
          }
          return containers[0];
        })
        .catch(notifyOnError);

      function notifyOnError(err) {
        this.Notifications.error('Failure', err, 'Unable to retrieve containers');
      }
    }

    function startCreationProcess(confirmed) {
      if (!confirmed) {
        return this.$q.when();
      }
      if (!validateAccessControl()) {
        return this.$q.when();
      }
      this.state.actionInProgress = true;
      return pullImageIfNeeded()
        .then(stopAndRenameContainer)
        .then(createNewContainer)
        .then(applyResourceControl)
        .then(connectToExtraNetworks)
        .then(removeOldContainer)
        .then(onSuccess)
        .catch(onCreationProcessFail);
    }

    function onCreationProcessFail(error) {
      var deferred = this.$q.defer();
      removeNewContainer()
        .then(restoreOldContainerName)
        .then(function() {
          deferred.reject(error);
        })
        .catch(function(restoreError) {
          deferred.reject(restoreError);
        });
      return deferred.promise;
    }

    function removeNewContainer() {
      return findCurrentContainer().then(function onContainerLoaded(container) {
        if (container && (!oldContainer || container.Id !== oldContainer.Id)) {
          return this.ContainerService.remove(container, true);
        }
      });
    }

    function restoreOldContainerName() {
      if (!oldContainer) {
        return;
      }
      return this.ContainerService.renameContainer(oldContainer.Id, oldContainer.Names[0].substring(1));
    }

    function confirmCreateContainer(container) {
      if (!container) {
        return this.$q.when(true);
      }

      return showConfirmationModal();

      function showConfirmationModal() {
        var deferred = this.$q.defer();

        this.ModalService.confirm({
          title: 'Are you sure ?',
          message: 'A container with the same name already exists. Portainer can automatically remove it and re-create one. Do you want to replace it?',
          buttons: {
            confirm: {
              label: 'Replace',
              className: 'btn-danger'
            }
          },
          callback: function onConfirm(confirmed) {
            deferred.resolve(confirmed);
          }
        });

        return deferred.promise;
      }
    }

    function stopAndRenameContainer() {
      if (!oldContainer) {
        return this.$q.when();
      }
      return stopContainerIfNeeded(oldContainer)
        .then(renameContainer);
    }

    function stopContainerIfNeeded(oldContainer) {
      if (oldContainer.State !== 'running') {
        return this.$q.when();
      }
      return this.ContainerService.stopContainer(oldContainer.Id);
    }

    function renameContainer() {
      return this.ContainerService.renameContainer(oldContainer.Id, oldContainer.Names[0].substring(1) + '-old');
    }

    function pullImageIfNeeded() {
      return this.$q.when(this.formValues.alwaysPull &&
        this.ImageService.pullImage(this.config.Image, this.formValues.Registry, true));
    }

    function createNewContainer() {
      var config = this.prepareConfiguration();
      return this.ContainerService.createAndStartContainer(config);
    }

    function applyResourceControl(newContainer) {
      var containerIdentifier = newContainer.Id;
      var userId = this.Authentication.getUserDetails().ID;

      return this.$q.when(this.ResourceControlService.applyResourceControl(
        'container',
        containerIdentifier,
        userId,
        this.formValues.AccessControlData, []
      )).then(function onApplyResourceControlSuccess() {
        return containerIdentifier;
      });
    }

    function connectToExtraNetworks(newContainerId) {
      if (!this.extraNetworks) {
        return this.$q.when();
      }

      var connectionPromises = Object.keys(this.extraNetworks).map(function (networkName) {
        return this.NetworkService.connectContainer(networkName, newContainerId);
      });

      return this.$q.all(connectionPromises);
    }

    function removeOldContainer() {
      var deferred = this.$q.defer();

      if (!oldContainer) {
        deferred.resolve();
        return;
      }

      this.ContainerService.remove(oldContainer, true)
        .then(notifyOnRemoval)
        .catch(notifyOnRemoveError);

      return deferred.promise;

      function notifyOnRemoval() {
        this.Notifications.success('Container Removed', oldContainer.Id);
        deferred.resolve();
      }

      function notifyOnRemoveError(err) {
        deferred.reject({ msg: 'Unable to remove container', err: err });
      }
    }

    function notifyOnError(err) {
      this.Notifications.error('Failure', err, 'Unable to create container');
    }

    function validateAccessControl() {
      var accessControlData = this.formValues.AccessControlData;
      var userDetails = this.Authentication.getUserDetails();
      var isAdmin = userDetails.role === 1;

      return this.validateForm(accessControlData, isAdmin);
    }

    function onSuccess() {
      this.Notifications.success('Container successfully created');
      this.$state.go('docker.containers', {}, { reload: true });
    }
  }
}

export default CreateContainerController;
angular.module('portainer.docker').controller('CreateContainerController', CreateContainerController);
