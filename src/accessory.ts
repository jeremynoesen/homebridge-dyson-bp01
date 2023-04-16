import {
    AccessoryConfig,
    AccessoryPlugin,
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    HAP,
    Logging,
    Service
} from "homebridge";
import BroadLinkJS from "kiwicam-broadlinkjs-rm";
import nodePersist from "node-persist";
import ping from "ping";
import * as constants from "./constants";
import * as messages from "./messages";

export = (api: API) => {
    api.registerAccessory(constants.ACCESSORY_NAME, DysonBP01);
};

/**
 * Dyson BP01 accessory for Homebridge
 *
 * @author Jeremy Noesen
 */
class DysonBP01 implements AccessoryPlugin {

    /**
     * Homebridge logging instance
     * @private
     */
    private readonly logging: Logging;

    /**
     * Homebridge HAP instance
     * @private
     */
    private readonly hap: HAP;

    /**
     * Accessory config options
     * @private
     */
    private readonly accessoryConfig: AccessoryConfig;

    /**
     * BroadLinkJS library
     * @private
     */
    private readonly broadLinkJS: BroadLinkJS;

    /**
     * BroadLink RM device
     * @private
     */
    private device: any;

    /**
     * Last ping status of the BroadLink RM
     * @private
     */
    private alive: boolean;

    /**
     * Node-persist storage
     * @private
     */
    private readonly localStorage: nodePersist.LocalStorage;

    /**
     * Services to provide accessory information, controls, and sensors
     * @private
     */
    private readonly services: {
        readonly accessoryInformation: Service,
        readonly fanV2: Service,
        readonly temperatureSensor: Service,
        readonly humiditySensor: Service
    };

    /**
     * Characteristics for the fanV2 service, which are also saved to storage
     * @private
     */
    private fanV2Characteristics: {
        targetActive: number,
        currentActive: number,
        targetRotationSpeed: number,
        currentRotationSpeed: number,
        targetSwingMode: number,
        currentSwingMode: number
    };

    /**
     * Characteristics for the sensors, which are not saved to storage
     * @private
     */
    private readonly sensorCharacteristics: {
        currentTemperature: number,
        currentRelativeHumidity: number
    };

    /**
     * Skips applied after certain events
     * @private
     */
    private readonly skips: {
        updateCurrentActive: number,
        updateCurrentSwingMode: number,
        updateSensorCharacteristics: number,
        pingDeviceFail: number
    };

    /**
     * Create DysonBP01 accessory
     * @param logging Homebridge logging instance
     * @param accessoryConfig Homebridge accessory config
     * @param api Homebridge API
     */
    constructor(logging: Logging, accessoryConfig: AccessoryConfig, api: API) {
        this.logging = logging;
        this.hap = api.hap;
        this.accessoryConfig = accessoryConfig;
        this.broadLinkJS = new BroadLinkJS();
        this.device = null;
        this.alive = false;
        this.localStorage = nodePersist.create();
        this.services = {
            accessoryInformation: new this.hap.Service.AccessoryInformation(),
            fanV2: new this.hap.Service.Fanv2(this.accessoryConfig.name),
            temperatureSensor: new this.hap.Service.TemperatureSensor(),
            humiditySensor: new this.hap.Service.HumiditySensor()
        };
        this.fanV2Characteristics = {
            targetActive: this.hap.Characteristic.Active.INACTIVE,
            currentActive: this.hap.Characteristic.Active.INACTIVE,
            targetRotationSpeed: constants.ROTATION_SPEED_MIN_STEP,
            currentRotationSpeed: constants.ROTATION_SPEED_MIN_STEP,
            targetSwingMode: this.hap.Characteristic.SwingMode.SWING_DISABLED,
            currentSwingMode: this.hap.Characteristic.SwingMode.SWING_DISABLED
        };
        this.sensorCharacteristics = {
            currentTemperature: 0,
            currentRelativeHumidity: 0
        };
        this.skips = {
            updateCurrentActive: 0,
            updateCurrentSwingMode: 0,
            updateSensorCharacteristics: 0,
            pingDeviceFail: 0
        };
        this.init(api);
    }

    /**
     * Identify accessory by toggling active
     */
    identify(): void {
        if (this.alive) {
            this.logging.info(messages.IDENTIFYING);
            let toggleCount: number = 0;
            let activeToggle: NodeJS.Timer = setInterval(async () => {
                if (toggleCount < constants.IDENTIFY_ACTIVE_TOGGLE_COUNT) {
                    if (this.fanV2Characteristics.targetActive == this.hap.Characteristic.Active.ACTIVE) {
                        await this.setTargetActive(this.hap.Characteristic.Active.INACTIVE, () => {
                        });
                    } else if (this.fanV2Characteristics.targetActive == this.hap.Characteristic.Active.INACTIVE) {
                        await this.setTargetActive(this.hap.Characteristic.Active.ACTIVE, () => {
                        });
                    }
                    toggleCount++;
                } else if (this.fanV2Characteristics.targetActive == this.fanV2Characteristics.currentActive) {
                    clearInterval(activeToggle);
                    this.logging.info(messages.IDENTIFIED);
                }
            }, constants.INTERVAL);
        }
    }

    /**
     * Initialize plugin
     * @param api Homebridge API
     * @private
     */
    private init(api: API): void {
        this.localStorage.init({
            dir: api.user.persistPath(),
            forgiveParseErrors: true
        }).then(() => {
            this.initFanV2Characteristics().then(() => {
                this.initDevice();
                this.initInterval();
            });
        });
        this.initServices();
    }

    /**
     * Set interval that updates accessory states
     * @private
     */
    private initInterval(): void {
        setInterval(async () => {
            if (this.device == null) {
                this.discoverDevices();
            } else {
                await this.pingDevice();
                if (this.alive) {
                    await this.updateFanV2Characteristics();
                    if (this.accessoryConfig.exposeSensors) {
                        this.updateSensorCharacteristics();
                    }
                }
                this.doSkips();
            }
        }, constants.INTERVAL);
    }

    /**
     * Do all skips
     * @private
     */
    private doSkips(): void {
        this.doUpdateCurrentActiveSkip();
        this.doUpdateCurrentSwingModeSkip();
        this.doUpdateSensorCharacteristicsSkip();
        this.doPingDeviceFailSkip();
    }

    /**
     * Initialize services for accessory
     * @private
     */
    private initServices(): void {
        this.initAccessoryInformationService();
        this.initFanV2Service();
        if (this.accessoryConfig.exposeSensors) {
            this.initSensorServices();
        }
    }

    /**
     * Initialize accessory information service
     * @private
     */
    private initAccessoryInformationService(): void {
        this.services.accessoryInformation
            .updateCharacteristic(this.hap.Characteristic.Manufacturer, messages.INFO_MANUFACTURER)
            .updateCharacteristic(this.hap.Characteristic.Model, messages.INFO_MODEL)
            .updateCharacteristic(this.hap.Characteristic.SerialNumber,
                this.accessoryConfig.serialNumber.toUpperCase());
    }

    /**
     * Get services for accessory
     */
    getServices(): Service[] {
        let services: Service[] = [
            this.services.accessoryInformation,
            this.services.fanV2
        ];
        if (this.accessoryConfig.exposeSensors) {
            services.push(
                this.services.temperatureSensor,
                this.services.humiditySensor
            );
        }
        return services;
    }

    /**
     * Initialize the BroadLink RM using a listener
     * @private
     */
    private initDevice(): void {
        this.broadLinkJS.on("deviceReady", device => {
            let macAddress: string = device.mac.toString("hex").replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase();
            this.logging.info(messages.DEVICE_DISCOVERED, macAddress);
            if (this.device == null && (this.accessoryConfig.macAddress == undefined ||
                this.accessoryConfig.macAddress.toUpperCase() == macAddress)) {
                this.device = device;
                if (this.accessoryConfig.exposeSensors) {
                    this.initSensors();
                }
                this.logging.info(messages.DEVICE_USING, macAddress);
            }
        });
        this.logging.info(messages.DEVICE_DISCOVERING);
    }

    /**
     * Discover BroadLink RM devices
     * @private
     */
    private discoverDevices(): void {
        this.broadLinkJS.discover();
    }

    /**
     * Ping the BroadLink RM to check if it is connected
     * @private
     */
    private async pingDevice(): Promise<void> {
        this.alive = await ping.promise.probe(this.device.host.address).then((pingResponse) => {
            return pingResponse.alive;
        });
        if (!this.alive) {
            if (this.skips.pingDeviceFail == 0) {
                this.logging.info(messages.DEVICE_PING_FAILED);
            }
            this.skips.pingDeviceFail = constants.SKIPS_PING_DEVICE_FAIL;
        } else if (this.skips.pingDeviceFail > 0) {
            if (this.skips.pingDeviceFail == constants.SKIPS_PING_DEVICE_FAIL - 1) {
                this.logging.info(messages.DEVICE_PING_STABILIZING);
            }
            this.alive = false;
        }
    }

    /**
     * Decrement ping device fail skips
     * @private
     */
    private doPingDeviceFailSkip(): void {
        if (this.skips.pingDeviceFail > 0) {
            this.skips.pingDeviceFail--;
            if (this.skips.pingDeviceFail == 0) {
                this.logging.info(messages.DEVICE_PING_STABILIZED);
            }
        }
    }

    /**
     * Send IR data to the BroadLink RM
     * @param data IR data as a hex string
     * @private
     */
    private sendDeviceData(data: string): void {
        this.device.sendData(Buffer.from(data, "hex"));
    }

    /**
     * Initialize fanV2 service
     * @private
     */
    private initFanV2Service(): void {
        this.services.fanV2.getCharacteristic(this.hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, this.getTargetActive.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetActive.bind(this));
        this.services.fanV2.getCharacteristic(this.hap.Characteristic.RotationSpeed)
            .on(CharacteristicEventTypes.GET, this.getTargetRotationSpeed.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetRotationSpeed.bind(this))
            .setProps({
                minStep: constants.ROTATION_SPEED_MIN_STEP
            });
        this.services.fanV2.getCharacteristic(this.hap.Characteristic.SwingMode)
            .on(CharacteristicEventTypes.GET, this.getTargetSwingMode.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetSwingMode.bind(this));
    }

    /**
     * Initialize fanV2 characteristics from persist storage or defaults
     * @private
     */
    private async initFanV2Characteristics(): Promise<void> {
        this.fanV2Characteristics =
            await this.localStorage.getItem(this.accessoryConfig.name) || this.fanV2Characteristics;
        this.logging.info(messages.INIT_TARGET_ACTIVE, this.fanV2Characteristics.targetActive);
        this.logging.info(messages.INIT_CURRENT_ACTIVE, this.fanV2Characteristics.currentActive);
        this.logging.info(messages.INIT_TARGET_ROTATION_SPEED, this.fanV2Characteristics.targetRotationSpeed);
        this.logging.info(messages.INIT_CURRENT_ROTATION_SPEED, this.fanV2Characteristics.currentRotationSpeed);
        this.logging.info(messages.INIT_TARGET_SWING_MODE, this.fanV2Characteristics.targetSwingMode);
        this.logging.info(messages.INIT_CURRENT_SWING_MODE, this.fanV2Characteristics.currentSwingMode);
    }

    /**
     * Update fanV2 characteristics with respect to update order
     * @private
     */
    private async updateFanV2Characteristics(): Promise<void> {
        if (this.canUpdateCurrentActive()) {
            await this.updateCurrentActive();
        } else if (this.canUpdateCurrentRotationSpeed()) {
            await this.updateCurrentRotationSpeed();
        } else if (this.canUpdateCurrentSwingMode()) {
            await this.updateCurrentSwingMode();
        }
    }

    /**
     * Save fanV2 characteristics to persist storage
     * @private
     */
    private async saveFanV2Characteristics(): Promise<void> {
        await this.localStorage.setItem(this.accessoryConfig.name, this.fanV2Characteristics);
    }

    /**
     * Get target active
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getTargetActive(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.alive ? null : new Error(messages.DEVICE_PING_FAILED),
            this.fanV2Characteristics.targetActive);
    }

    /**
     * Set target active
     * @param characteristicValue New characteristic value to set
     * @param characteristicSetCallback Characteristic set callback
     * @private
     */
    private async setTargetActive(characteristicValue: CharacteristicValue,
                                  characteristicSetCallback: CharacteristicSetCallback): Promise<void> {
        if (this.alive) {
            if (characteristicValue as number != this.fanV2Characteristics.targetActive) {
                this.fanV2Characteristics.targetActive = characteristicValue as number;
                await this.saveFanV2Characteristics();
                this.logging.info(messages.SET_TARGET_ACTIVE, this.fanV2Characteristics.targetActive);
            }
            characteristicSetCallback();
        } else {
            characteristicSetCallback(new Error(messages.DEVICE_PING_FAILED));
        }
    }

    /**
     * Check if current active can be updated
     * @private
     */
    private canUpdateCurrentActive(): boolean {
        return this.fanV2Characteristics.currentActive != this.fanV2Characteristics.targetActive &&
            this.skips.updateCurrentActive == 0 &&
            this.skips.updateCurrentSwingMode == 0;
    }

    /**
     * Update current active based on target active
     * @private
     */
    private async updateCurrentActive(): Promise<void> {
        this.sendDeviceData(constants.DATA_ACTIVE);
        this.fanV2Characteristics.currentActive = this.fanV2Characteristics.targetActive;
        if (this.fanV2Characteristics.currentActive == this.hap.Characteristic.Active.ACTIVE) {
            this.skips.updateCurrentActive = constants.SKIPS_UPDATE_CURRENT_ACTIVE_ACTIVE;
        } else if (this.fanV2Characteristics.currentActive == this.hap.Characteristic.Active.INACTIVE) {
            this.skips.updateCurrentActive = constants.SKIPS_UPDATE_CURRENT_ACTIVE_INACTIVE;
        }
        await this.saveFanV2Characteristics();
        this.logging.info(messages.UPDATED_CURRENT_ACTIVE, this.fanV2Characteristics.currentActive);
    }

    /**
     * Decrement update current active skips
     * @private
     */
    private doUpdateCurrentActiveSkip(): void {
        if (this.skips.updateCurrentActive > 0) {
            this.skips.updateCurrentActive--;
        }
    }

    /**
     * Get target rotation speed
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getTargetRotationSpeed(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.alive ? null : new Error(messages.DEVICE_PING_FAILED),
            this.fanV2Characteristics.targetRotationSpeed);
    }

    /**
     * Set target rotation speed
     * @param characteristicValue New characteristic value to set
     * @param characteristicSetCallback Characteristic set callback
     * @private
     */
    private async setTargetRotationSpeed(characteristicValue: CharacteristicValue,
                                         characteristicSetCallback: CharacteristicSetCallback): Promise<void> {
        if (this.alive) {
            let clampedCharacteristicValue: number = characteristicValue as number;
            if (clampedCharacteristicValue < constants.ROTATION_SPEED_MIN_STEP) {
                clampedCharacteristicValue = constants.ROTATION_SPEED_MIN_STEP;
                this.services.fanV2.updateCharacteristic(this.hap.Characteristic.RotationSpeed,
                    clampedCharacteristicValue);
            }
            if (clampedCharacteristicValue != this.fanV2Characteristics.targetRotationSpeed) {
                this.fanV2Characteristics.targetRotationSpeed = clampedCharacteristicValue;
                await this.saveFanV2Characteristics();
                this.logging.info(messages.SET_TARGET_ROTATION_SPEED, this.fanV2Characteristics.targetRotationSpeed);
            }
            characteristicSetCallback();
        } else {
            characteristicSetCallback(new Error(messages.DEVICE_PING_FAILED));
        }
    }

    /**
     * Check if current rotation speed can be updated
     * @private
     */
    private canUpdateCurrentRotationSpeed(): boolean {
        return this.fanV2Characteristics.currentRotationSpeed != this.fanV2Characteristics.targetRotationSpeed &&
            this.fanV2Characteristics.currentActive == this.hap.Characteristic.Active.ACTIVE &&
            this.skips.updateCurrentActive == 0 &&
            this.skips.updateCurrentSwingMode == 0;
    }

    /**
     * Update current rotation speed based on target rotation speed
     * @private
     */
    private async updateCurrentRotationSpeed(): Promise<void> {
        if (this.fanV2Characteristics.currentRotationSpeed < this.fanV2Characteristics.targetRotationSpeed) {
            this.sendDeviceData(constants.DATA_ROTATION_SPEED_UP);
            this.fanV2Characteristics.currentRotationSpeed += constants.ROTATION_SPEED_MIN_STEP;
        } else if (this.fanV2Characteristics.currentRotationSpeed > this.fanV2Characteristics.targetRotationSpeed) {
            this.sendDeviceData(constants.DATA_ROTATION_SPEED_DOWN);
            this.fanV2Characteristics.currentRotationSpeed -= constants.ROTATION_SPEED_MIN_STEP;
        }
        await this.saveFanV2Characteristics();
        this.logging.info(messages.UPDATED_CURRENT_ROTATION_SPEED, this.fanV2Characteristics.currentRotationSpeed);
    }

    /**
     * Get target swing mode
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getTargetSwingMode(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.alive ? null : new Error(messages.DEVICE_PING_FAILED),
            this.fanV2Characteristics.targetSwingMode);
    }

    /**
     * Set target swing mode
     * @param characteristicValue New characteristic value to set
     * @param characteristicSetCallback Characteristic set callback
     * @private
     */
    private async setTargetSwingMode(characteristicValue: CharacteristicValue,
                                     characteristicSetCallback: CharacteristicSetCallback): Promise<void> {
        if (this.alive) {
            if (characteristicValue as number != this.fanV2Characteristics.targetSwingMode) {
                this.fanV2Characteristics.targetSwingMode = characteristicValue as number;
                await this.saveFanV2Characteristics();
                this.logging.info(messages.SET_TARGET_SWING_MODE, this.fanV2Characteristics.targetSwingMode);
            }
            characteristicSetCallback();
        } else {
            characteristicSetCallback(new Error(messages.DEVICE_PING_FAILED));
        }
    }

    /**
     * Check if current swing mode can be updated
     * @private
     */
    private canUpdateCurrentSwingMode(): boolean {
        return this.fanV2Characteristics.currentSwingMode != this.fanV2Characteristics.targetSwingMode &&
            this.fanV2Characteristics.currentActive == this.hap.Characteristic.Active.ACTIVE &&
            this.skips.updateCurrentActive == 0;
    }

    /**
     * Update current swing mode based on target swing mode
     * @private
     */
    private async updateCurrentSwingMode(): Promise<void> {
        this.sendDeviceData(constants.DATA_SWING_MODE);
        this.fanV2Characteristics.currentSwingMode = this.fanV2Characteristics.targetSwingMode;
        this.skips.updateCurrentSwingMode = constants.SKIPS_UPDATE_CURRENT_SWING_MODE;
        await this.saveFanV2Characteristics();
        this.logging.info(messages.UPDATED_CURRENT_SWING_MODE, this.fanV2Characteristics.currentSwingMode);
    }

    /**
     * Decrement update current swing mode skips
     * @private
     */
    private doUpdateCurrentSwingModeSkip(): void {
        if (this.skips.updateCurrentSwingMode > 0) {
            this.skips.updateCurrentSwingMode--;
        }
    }

    /**
     * Initialize sensor data listener
     * @private
     */
    private initSensors(): void {
        this.device.on("temperature", (temp, humidity) => {
            this.setCurrentTemperature(temp);
            this.setCurrentRelativeHumidity(humidity);
        });
    }

    /**
     * Initialize sensor services
     * @private
     */
    private initSensorServices(): void {
        this.services.temperatureSensor.getCharacteristic(this.hap.Characteristic.CurrentTemperature)
            .on(CharacteristicEventTypes.GET, this.getCurrentTemperature.bind(this))
            .setProps({
                minStep: constants.SENSOR_MIN_STEP
            });
        this.services.humiditySensor.getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity)
            .on(CharacteristicEventTypes.GET, this.getCurrentRelativeHumidity.bind(this))
            .setProps({
                minStep: constants.SENSOR_MIN_STEP
            });
    }

    /**
     * Check if sensor characteristics can be updated
     */
    private canUpdateSensorCharacteristics(): boolean {
        return this.skips.updateSensorCharacteristics == 0;
    }

    /**
     * Update sensor characteristics from BroadLink RM
     * @private
     */
    private updateSensorCharacteristics(): void {
        if (this.canUpdateSensorCharacteristics()) {
            this.device.checkTemperature();
            this.skips.updateSensorCharacteristics = constants.SKIPS_UPDATE_SENSOR_CHARACTERISTICS;
        }
    }

    /**
     * Decrement update sensor characteristics skips
     */
    private doUpdateSensorCharacteristicsSkip(): void {
        if (this.skips.updateSensorCharacteristics > 0) {
            this.skips.updateSensorCharacteristics--;
        }
    }

    /**
     * Get current temperature
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getCurrentTemperature(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.alive ? null : new Error(messages.DEVICE_PING_FAILED),
            this.sensorCharacteristics.currentTemperature);
    }

    /**
     * Set current temperature
     * @param characteristicValue New characteristic value to set
     * @private
     */
    private setCurrentTemperature(characteristicValue: CharacteristicValue): void {
        if (characteristicValue as number != this.sensorCharacteristics.currentTemperature) {
            this.sensorCharacteristics.currentTemperature = characteristicValue as number;
            this.logging.info(messages.SET_CURRENT_TEMPERATURE, this.sensorCharacteristics.currentTemperature);
        }
    }

    /**
     * Get current relative humidity
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getCurrentRelativeHumidity(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.alive ? null : new Error(messages.DEVICE_PING_FAILED),
            this.sensorCharacteristics.currentRelativeHumidity);
    }

    /**
     * Set current relative humidity
     * @param characteristicValue New characteristic value to set
     * @private
     */
    private setCurrentRelativeHumidity(characteristicValue: CharacteristicValue): void {
        if (characteristicValue as number != this.sensorCharacteristics.currentRelativeHumidity) {
            this.sensorCharacteristics.currentRelativeHumidity = characteristicValue as number;
            this.logging.info(messages.SET_CURRENT_RELATIVE_HUMIDITY,
                this.sensorCharacteristics.currentRelativeHumidity);
        }
    }
}
