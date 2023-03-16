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
     * Node-persist storage
     * @private
     */
    private readonly localStorage: nodePersist.LocalStorage;

    /**
     * Homebridge modules
     * @private
     */
    private readonly homebridge: {
        readonly logging: Logging,
        readonly hap: HAP
    };

    /**
     * BroadLinkJS library and device
     * @private
     */
    private readonly broadLink: {
        readonly broadLinkJS: BroadLinkJS,
        device: any,
        deviceConnected: boolean
    };

    /**
     * Accessory config options
     * @private
     */
    private readonly config: {
        readonly name: string,
        readonly serialNumber: string,
        readonly macAddress: string,
        readonly exposeSensors: boolean
    };

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
     * Characteristic current and target states
     * @private
     */
    private characteristics: {
        targetActive: number,
        targetRotationSpeed: number,
        targetSwingMode: number,
        currentActive: number,
        currentRotationSpeed: number,
        currentSwingMode: number,
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
        deviceReconnect: number
    };

    /**
     * Create DysonBP01 accessory
     * @param logging Homebridge logging instance
     * @param accessoryConfig Homebridge accessory config
     * @param api Homebridge API
     */
    constructor(logging: Logging, accessoryConfig: AccessoryConfig, api: API) {
        this.localStorage = nodePersist.create();
        this.homebridge = {
            logging: logging,
            hap: api.hap
        };
        this.broadLink = {
            broadLinkJS: new BroadLinkJS(),
            device: null,
            deviceConnected: false
        };
        this.config = {
            name: accessoryConfig.name,
            serialNumber: accessoryConfig.serialNumber,
            macAddress: accessoryConfig.macAddress,
            exposeSensors: accessoryConfig.exposeSensors
        };
        this.services = {
            accessoryInformation: new this.homebridge.hap.Service.AccessoryInformation(),
            fanV2: new this.homebridge.hap.Service.Fanv2(this.config.name),
            temperatureSensor: new this.homebridge.hap.Service.TemperatureSensor(),
            humiditySensor: new this.homebridge.hap.Service.HumiditySensor()
        };
        this.characteristics = {
            targetActive: this.homebridge.hap.Characteristic.Active.INACTIVE,
            targetRotationSpeed: constants.ROTATION_SPEED_STEP_SIZE,
            targetSwingMode: this.homebridge.hap.Characteristic.SwingMode.SWING_DISABLED,
            currentActive: this.homebridge.hap.Characteristic.Active.INACTIVE,
            currentRotationSpeed: constants.ROTATION_SPEED_STEP_SIZE,
            currentSwingMode: this.homebridge.hap.Characteristic.SwingMode.SWING_DISABLED,
            currentTemperature: 0,
            currentRelativeHumidity: 0
        };
        this.skips = {
            updateCurrentActive: 0,
            updateCurrentSwingMode: 0,
            deviceReconnect: 0
        };
        this.initServices();
        this.localStorage.init({
            dir: api.user.persistPath(),
            forgiveParseErrors: true
        }).then(() => {
            this.initCharacteristics().then(() => {
                this.initDevice();
                this.initInterval();
            });
        });
    }

    /**
     * Set interval that updates accessory states
     * @private
     */
    private initInterval(): void {
        setInterval(async () => {
            if (this.broadLink.device == null) {
                this.broadLink.broadLinkJS.discover();
            } else {
                this.broadLink.deviceConnected = await this.isDeviceConnected();
                if (this.canUpdateCurrentActive()) {
                    await this.updateCurrentActive();
                } else if (this.canUpdateCurrentRotationSpeed()) {
                    await this.updateCurrentRotationSpeed();
                } else if (this.canUpdateCurrentSwingMode()) {
                    await this.updateCurrentSwingMode();
                }
                this.doUpdateCurrentActiveSkip();
                this.doUpdateCurrentSwingModeSkip();
                this.doDeviceReconnectSkip();
                if (this.broadLink.deviceConnected && this.config.exposeSensors) {
                    this.broadLink.device.checkTemperature();
                }
            }
        }, constants.INTERVAL);
    }

    /**
     * Initialize services for accessory
     * @private
     */
    private initServices(): void {
        this.services.accessoryInformation
            .updateCharacteristic(this.homebridge.hap.Characteristic.Manufacturer, messages.INFO_MANUFACTURER)
            .updateCharacteristic(this.homebridge.hap.Characteristic.Model, messages.INFO_MODEL)
            .updateCharacteristic(this.homebridge.hap.Characteristic.SerialNumber,
                this.config.serialNumber == undefined ? null : this.config.serialNumber.toUpperCase());
        this.services.fanV2.getCharacteristic(this.homebridge.hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, this.getTargetActive.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetActive.bind(this));
        this.services.fanV2.getCharacteristic(this.homebridge.hap.Characteristic.RotationSpeed)
            .on(CharacteristicEventTypes.GET, this.getTargetRotationSpeed.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetRotationSpeed.bind(this))
            .setProps({
                minStep: constants.ROTATION_SPEED_STEP_SIZE
            });
        this.services.fanV2.getCharacteristic(this.homebridge.hap.Characteristic.SwingMode)
            .on(CharacteristicEventTypes.GET, this.getTargetSwingMode.bind(this))
            .on(CharacteristicEventTypes.SET, this.setTargetSwingMode.bind(this));
        if (this.config.exposeSensors) {
            this.services.temperatureSensor.getCharacteristic(this.homebridge.hap.Characteristic.CurrentTemperature)
                .on(CharacteristicEventTypes.GET, this.getCurrentTemperature.bind(this));
            this.services.humiditySensor.getCharacteristic(this.homebridge.hap.Characteristic.CurrentRelativeHumidity)
                .on(CharacteristicEventTypes.GET, this.getCurrentRelativeHumidity.bind(this));
        }
    }

    /**
     * Get services for accessory
     */
    getServices(): Service[] {
        let services: Service[] = [
            this.services.accessoryInformation,
            this.services.fanV2
        ];
        if (this.config.exposeSensors) {
            services.push(
                this.services.temperatureSensor,
                this.services.humiditySensor
            );
        }
        return services;
    }

    /**
     * Identify accessory by toggling Active
     */
    identify(): void {
        if (this.broadLink.deviceConnected) {
            this.homebridge.logging.info(messages.IDENTIFYING);
            let i: number = 0;
            let activeToggle: NodeJS.Timer = setInterval(async () => {
                if (this.characteristics.targetActive == this.characteristics.currentActive) {
                    if (i < constants.IDENTIFY_ACTIVE_TOGGLE_COUNT) {
                        if (this.characteristics.targetActive ==
                            this.homebridge.hap.Characteristic.Active.ACTIVE) {
                            await this.setTargetActive(this.homebridge.hap.Characteristic.Active.INACTIVE, () => {
                            });
                        } else if (this.characteristics.targetActive ==
                            this.homebridge.hap.Characteristic.Active.INACTIVE) {
                            await this.setTargetActive(this.homebridge.hap.Characteristic.Active.ACTIVE, () => {
                            });
                        }
                    } else {
                        clearInterval(activeToggle);
                        this.homebridge.logging.info(messages.IDENTIFIED);
                    }
                    i++;
                }
            }, constants.INTERVAL);
        }
    }

    /**
     * Initialize the BroadLink RM
     * @private
     */
    private initDevice(): void {
        this.broadLink.broadLinkJS.on("deviceReady", device => {
            let macAddress: string = device.mac.toString("hex").replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase();
            this.homebridge.logging.info(messages.DEVICE_DISCOVERED.replace(messages.PLACEHOLDER, macAddress));
            if (this.broadLink.device == null &&
                (this.config.macAddress == undefined || this.config.macAddress.toUpperCase() == macAddress)) {
                this.broadLink.device = device;
                if (this.config.exposeSensors) {
                    this.broadLink.device.on("temperature", async (temp, humidity) => {
                        await this.setCurrentTemperature(temp);
                        await this.setCurrentRelativeHumidity(humidity);
                    });
                }
                this.homebridge.logging.info(messages.DEVICE_USING.replace(messages.PLACEHOLDER, macAddress));
            }
        });
        this.homebridge.logging.info(messages.DEVICE_DISCOVERING);
    }

    /**
     * Check if BroadLink RM is connected
     * @private
     */
    private async isDeviceConnected(): Promise<boolean> {
        let alive: boolean = await ping.promise.probe(this.broadLink.device.host.address).then((pingResponse) => {
            return pingResponse.alive;
        });
        if (!alive) {
            if (this.skips.deviceReconnect == 0) {
                this.homebridge.logging.info(messages.DEVICE_DISCONNECTED);
            }
            this.skips.deviceReconnect = constants.SKIPS_DEVICE_RECONNECT;
        } else if (this.skips.deviceReconnect > 0) {
            if (this.skips.deviceReconnect == constants.SKIPS_DEVICE_RECONNECT - 1) {
                this.homebridge.logging.info(messages.DEVICE_RECONNECTING);
            }
            alive = false;
        }
        return alive;
    }

    /**
     * Decrement device skips
     * @private
     */
    private doDeviceReconnectSkip(): void {
        if (this.skips.deviceReconnect > 0) {
            this.skips.deviceReconnect--;
            if (this.skips.deviceReconnect == 0) {
                this.homebridge.logging.info(messages.DEVICE_RECONNECTED);
            }
        }
    }

    /**
     * Initialize characteristics from persist storage or defaults
     * @private
     */
    private async initCharacteristics(): Promise<void> {
        this.characteristics = await this.localStorage.getItem(this.config.name) || this.characteristics;
        this.homebridge.logging.info(messages.INIT_TARGET_ACTIVE
            .replace(messages.PLACEHOLDER, this.characteristics.targetActive + ""));
        this.homebridge.logging.info(messages.INIT_TARGET_ROTATION_SPEED
            .replace(messages.PLACEHOLDER, this.characteristics.targetRotationSpeed + ""));
        this.homebridge.logging.info(messages.INIT_TARGET_SWING_MODE
            .replace(messages.PLACEHOLDER, this.characteristics.targetSwingMode + ""));
        this.homebridge.logging.info(messages.INIT_CURRENT_ACTIVE
            .replace(messages.PLACEHOLDER, this.characteristics.currentActive + ""));
        this.homebridge.logging.info(messages.INIT_CURRENT_ROTATION_SPEED
            .replace(messages.PLACEHOLDER, this.characteristics.currentRotationSpeed + ""));
        this.homebridge.logging.info(messages.INIT_CURRENT_SWING_MODE
            .replace(messages.PLACEHOLDER, this.characteristics.currentSwingMode + ""));
        if (this.config.exposeSensors) {
            this.homebridge.logging.info(messages.INIT_CURRENT_TEMPERATURE
                .replace(messages.PLACEHOLDER, this.characteristics.currentTemperature + ""));
            this.homebridge.logging.info(messages.INIT_CURRENT_RELATIVE_HUMIDITY
                .replace(messages.PLACEHOLDER, this.characteristics.currentRelativeHumidity + ""));
        }
    }

    /**
     * Get target Active
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getTargetActive(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.broadLink.deviceConnected ? null : new Error(messages.DEVICE_DISCONNECTED),
            this.characteristics.targetActive);
    }

    /**
     * Set target Active
     * @param characteristicValue New characteristic value to set
     * @param characteristicSetCallback Characteristic set callback
     * @private
     */
    private async setTargetActive(characteristicValue: CharacteristicValue,
                                  characteristicSetCallback: CharacteristicSetCallback): Promise<void> {
        if (this.broadLink.deviceConnected) {
            if (characteristicValue as number != this.characteristics.targetActive) {
                this.characteristics.targetActive = characteristicValue as number;
                await this.localStorage.setItem(this.config.name, this.characteristics);
                this.homebridge.logging.info(messages.SET_TARGET_ACTIVE
                    .replace(messages.PLACEHOLDER, this.characteristics.targetActive + ""));
            }
            characteristicSetCallback();
        } else {
            characteristicSetCallback(new Error(messages.DEVICE_DISCONNECTED));
        }
    }

    /**
     * Check if current Active can be updated
     * @private
     */
    private canUpdateCurrentActive(): boolean {
        return this.broadLink.deviceConnected &&
            this.characteristics.currentActive != this.characteristics.targetActive &&
            this.skips.updateCurrentActive == 0 &&
            this.skips.updateCurrentSwingMode == 0;
    }

    /**
     * Update current Active based on target Active
     * @private
     */
    private async updateCurrentActive(): Promise<void> {
        this.broadLink.device.sendData(Buffer.from(constants.IR_DATA_ACTIVE, "hex"));
        this.characteristics.currentActive = this.characteristics.targetActive;
        if (this.characteristics.currentActive == this.homebridge.hap.Characteristic.Active.ACTIVE) {
            this.skips.updateCurrentActive = constants.SKIPS_UPDATE_CURRENT_ACTIVE_ACTIVE;
        } else if (this.characteristics.currentActive == this.homebridge.hap.Characteristic.Active.INACTIVE) {
            this.skips.updateCurrentActive = constants.SKIPS_UPDATE_CURRENT_ACTIVE_INACTIVE;
        }
        await this.localStorage.setItem(this.config.name, this.characteristics);
        this.homebridge.logging.info(messages.UPDATED_CURRENT_ACTIVE
            .replace(messages.PLACEHOLDER, this.characteristics.currentActive + ""));
    }

    /**
     * Decrement Active skips
     * @private
     */
    private doUpdateCurrentActiveSkip(): void {
        if (this.skips.updateCurrentActive > 0) {
            this.skips.updateCurrentActive--;
        }
    }

    /**
     * Get target Rotation Speed
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getTargetRotationSpeed(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.broadLink.deviceConnected ? null : new Error(messages.DEVICE_DISCONNECTED),
            this.characteristics.targetRotationSpeed);
    }

    /**
     * Set target Rotation Speed
     * @param characteristicValue New characteristic value to set
     * @param characteristicSetCallback Characteristic set callback
     * @private
     */
    private async setTargetRotationSpeed(characteristicValue: CharacteristicValue,
                                         characteristicSetCallback: CharacteristicSetCallback): Promise<void> {
        if (this.broadLink.deviceConnected) {
            let clampedCharacteristicValue: number = characteristicValue as number;
            if (clampedCharacteristicValue < constants.ROTATION_SPEED_STEP_SIZE) {
                clampedCharacteristicValue = constants.ROTATION_SPEED_STEP_SIZE;
                this.services.fanV2.updateCharacteristic(this.homebridge.hap.Characteristic.RotationSpeed,
                    clampedCharacteristicValue);
            }
            if (clampedCharacteristicValue != this.characteristics.targetRotationSpeed) {
                this.characteristics.targetRotationSpeed = clampedCharacteristicValue;
                await this.localStorage.setItem(this.config.name, this.characteristics);
                this.homebridge.logging.info(messages.SET_TARGET_ROTATION_SPEED
                    .replace(messages.PLACEHOLDER, this.characteristics.targetRotationSpeed + ""));
            }
            characteristicSetCallback();
        } else {
            characteristicSetCallback(new Error(messages.DEVICE_DISCONNECTED));
        }
    }

    /**
     * Check if current Rotation Speed can be updated
     * @private
     */
    private canUpdateCurrentRotationSpeed(): boolean {
        return this.broadLink.deviceConnected &&
            this.characteristics.currentRotationSpeed != this.characteristics.targetRotationSpeed &&
            this.characteristics.currentActive == this.homebridge.hap.Characteristic.Active.ACTIVE &&
            this.skips.updateCurrentActive == 0 &&
            this.skips.updateCurrentSwingMode == 0;
    }

    /**
     * Update current Rotation Speed based on target Rotation Speed
     * @private
     */
    private async updateCurrentRotationSpeed(): Promise<void> {
        if (this.characteristics.currentRotationSpeed < this.characteristics.targetRotationSpeed) {
            this.broadLink.device.sendData(Buffer.from(constants.IR_DATA_ROTATION_SPEED_UP, "hex"));
            this.characteristics.currentRotationSpeed += constants.ROTATION_SPEED_STEP_SIZE;
        } else if (this.characteristics.currentRotationSpeed > this.characteristics.targetRotationSpeed) {
            this.broadLink.device.sendData(Buffer.from(constants.IR_DATA_ROTATION_SPEED_DOWN, "hex"));
            this.characteristics.currentRotationSpeed -= constants.ROTATION_SPEED_STEP_SIZE;
        }
        await this.localStorage.setItem(this.config.name, this.characteristics);
        this.homebridge.logging.info(messages.UPDATED_CURRENT_ROTATION_SPEED
            .replace(messages.PLACEHOLDER, this.characteristics.currentRotationSpeed + ""));
    }

    /**
     * Get target Swing Mode
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getTargetSwingMode(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.broadLink.deviceConnected ? null : new Error(messages.DEVICE_DISCONNECTED),
            this.characteristics.targetSwingMode);
    }

    /**
     * Set target Swing Mode
     * @param characteristicValue New characteristic value to set
     * @param characteristicSetCallback Characteristic set callback
     * @private
     */
    private async setTargetSwingMode(characteristicValue: CharacteristicValue,
                                     characteristicSetCallback: CharacteristicSetCallback): Promise<void> {
        if (this.broadLink.deviceConnected) {
            if (characteristicValue as number != this.characteristics.targetSwingMode) {
                this.characteristics.targetSwingMode = characteristicValue as number;
                await this.localStorage.setItem(this.config.name, this.characteristics);
                this.homebridge.logging.info(messages.SET_TARGET_SWING_MODE
                    .replace(messages.PLACEHOLDER, this.characteristics.targetSwingMode + ""));
            }
            characteristicSetCallback();
        } else {
            characteristicSetCallback(new Error(messages.DEVICE_DISCONNECTED));
        }
    }

    /**
     * Check if current Swing Mode can be updated
     * @private
     */
    private canUpdateCurrentSwingMode(): boolean {
        return this.broadLink.deviceConnected &&
            this.characteristics.currentSwingMode != this.characteristics.targetSwingMode &&
            this.characteristics.currentActive == this.homebridge.hap.Characteristic.Active.ACTIVE &&
            this.skips.updateCurrentActive == 0;
    }

    /**
     * Update current Swing Mode based on target Swing Mode
     * @private
     */
    private async updateCurrentSwingMode(): Promise<void> {
        this.broadLink.device.sendData(Buffer.from(constants.IR_DATA_SWING_MODE, "hex"));
        this.characteristics.currentSwingMode = this.characteristics.targetSwingMode;
        this.skips.updateCurrentSwingMode = constants.SKIPS_UPDATE_CURRENT_SWING_MODE;
        await this.localStorage.setItem(this.config.name, this.characteristics);
        this.homebridge.logging.info(messages.UPDATED_CURRENT_SWING_MODE
            .replace(messages.PLACEHOLDER, this.characteristics.currentSwingMode + ""));
    }

    /**
     * Decrement Swing Mode skips
     * @private
     */
    private doUpdateCurrentSwingModeSkip(): void {
        if (this.skips.updateCurrentSwingMode > 0) {
            this.skips.updateCurrentSwingMode--;
        }
    }

    /**
     * Get Current Temperature
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getCurrentTemperature(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.broadLink.deviceConnected ? null : new Error(messages.DEVICE_DISCONNECTED),
            this.characteristics.currentTemperature);
    }

    /**
     * Set Current Temperature
     * @param characteristicValue New characteristic value to set
     * @private
     */
    private async setCurrentTemperature(characteristicValue: CharacteristicValue): Promise<void> {
        if (characteristicValue as number != this.characteristics.currentTemperature) {
            this.characteristics.currentTemperature = characteristicValue as number;
            await this.localStorage.setItem(this.config.name, this.characteristics);
            this.homebridge.logging.info(messages.SET_CURRENT_TEMPERATURE
                .replace(messages.PLACEHOLDER, this.characteristics.currentTemperature + ""));
        }
    }

    /**
     * Get Current Relative Humidity
     * @param characteristicGetCallback Characteristic get callback
     * @private
     */
    private getCurrentRelativeHumidity(characteristicGetCallback: CharacteristicGetCallback): void {
        characteristicGetCallback(this.broadLink.deviceConnected ? null : new Error(messages.DEVICE_DISCONNECTED),
            this.characteristics.currentRelativeHumidity);
    }

    /**
     * Set Current Relative Humidity
     * @param characteristicValue New characteristic value to set
     * @private
     */
    private async setCurrentRelativeHumidity(characteristicValue: CharacteristicValue): Promise<void> {
        if (characteristicValue as number != this.characteristics.currentRelativeHumidity) {
            this.characteristics.currentRelativeHumidity = characteristicValue as number;
            await this.localStorage.setItem(this.config.name, this.characteristics);
            this.homebridge.logging.info(messages.SET_CURRENT_RELATIVE_HUMIDITY
                .replace(messages.PLACEHOLDER, this.characteristics.currentRelativeHumidity + ""));
        }
    }
}
