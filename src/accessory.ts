import {AccessoryConfig, AccessoryPlugin, API, CharacteristicValue, HAP, Logging, Service} from "homebridge";
import BroadLinkJS from "kiwicam-broadlinkjs-rm";
import node_persist from "node-persist";
import ping from "ping";
import * as constants from "./constants";
import * as messages from "./messages";

export = (api: API) => {
    api.registerAccessory(constants.ACCESSORY_ID, DysonBP01);
};

/**
 * Dyson BP01 accessory for Homebridge
 */
class DysonBP01 implements AccessoryPlugin {

    /**
     * Homebridge logging instance
     * @private
     */
    private readonly log: Logging;

    /**
     * Homebridge HAP instance
     * @private
     */
    private readonly hap: HAP;

    /**
     * BroadLinkJS instance
     * @private
     */
    private readonly broadlink: BroadLinkJS;

    /**
     * Node-persist storage instance
     * @private
     */
    private readonly storage: node_persist.LocalStorage;

    /**
     * Accessory name
     * @private
     */
    private readonly name: string;

    /**
     * Serial number of Dyson BP01
     * @private
     */
    private readonly serial: string;

    /**
     * MAC address of BroadLink RM to connect to
     * @private
     */
    private readonly mac: string;

    /**
     * Whether to expose BroadLink RM sensors or not
     * @private
     */
    private readonly sensors: boolean;

    /**
     * BroadLink RM used to send signals
     * @private
     */
    private device: any;

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
        currentActive: number,
        targetActive: number,
        currentRotationSpeed: number,
        targetRotationSpeed: number,
        currentSwingMode: number,
        targetSwingMode: number,
        currentTemperature: number,
        currentRelativeHumidity: number
    };

    /**
     * Loop skips applied after characteristic updates or device reconnect
     * @private
     */
    private readonly skips: {
        active: number,
        swingMode: number,
        device: number
    };

    /**
     * Create DysonBP01 accessory
     * @param log Homebridge logging instance
     * @param config Homebridge config
     * @param api Homebridge API
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.hap = api.hap;
        this.broadlink = new BroadLinkJS();
        this.storage = node_persist.create();
        this.name = config.name;
        this.serial = config.serial;
        this.mac = config.mac;
        this.sensors = config.sensors;
        this.device = null;
        this.services = {
            accessoryInformation: new this.hap.Service.AccessoryInformation(),
            fanV2: new this.hap.Service.Fanv2(config.name),
            temperatureSensor: new this.hap.Service.TemperatureSensor(config.name),
            humiditySensor: new this.hap.Service.HumiditySensor(config.name)
        };
        this.characteristics = {
            currentActive: this.hap.Characteristic.Active.INACTIVE,
            targetActive: this.hap.Characteristic.Active.INACTIVE,
            currentRotationSpeed: constants.STEP_SIZE,
            targetRotationSpeed: constants.STEP_SIZE,
            currentSwingMode: this.hap.Characteristic.SwingMode.SWING_DISABLED,
            targetSwingMode: this.hap.Characteristic.SwingMode.SWING_DISABLED,
            currentTemperature: 0,
            currentRelativeHumidity: 0
        };
        this.skips = {
            active: 0,
            swingMode: 0,
            device: 0
        };
        this.initServices();
        this.storage.init({
            dir: api.user.persistPath(),
            forgiveParseErrors: true
        }).then(() => {
            this.initCharacteristics().then(() => {
                this.initDevice();
                this.initLoop();
            });
        });
    }

    /**
     * Start loop that updates accessory states
     * @private
     */
    private initLoop(): void {
        setInterval(async () => {
            if (this.device == null) {
                this.broadlink.discover();
            } else {
                if (await this.isDeviceConnected()) {
                    if (this.canUpdateCurrentActive()) {
                        await this.updateCurrentActive();
                    } else if (this.canUpdateCurrentRotationSpeed()) {
                        await this.updateCurrentRotationSpeed();
                    } else if (this.canUpdateCurrentSwingMode()) {
                        await this.updateCurrentSwingMode();
                    }
                    if (this.sensors) {
                        this.device.checkTemperature();
                    }
                }
                this.doActiveSkip();
                this.doSwingModeSkip();
                this.doDeviceSkip();
            }
        }, constants.INTERVAL);
    }

    /**
     * Initialize services for accessory
     * @private
     */
    private initServices(): void {
        this.services.accessoryInformation
            .updateCharacteristic(this.hap.Characteristic.Manufacturer, messages.INFO_MANUFACTURER)
            .updateCharacteristic(this.hap.Characteristic.Model, messages.INFO_MODEL)
            .updateCharacteristic(this.hap.Characteristic.SerialNumber,
                this.serial ? this.serial.toUpperCase() : messages.INFO_SERIAL_NUMBER);
        this.services.fanV2.getCharacteristic(this.hap.Characteristic.Active)
            .onGet(this.getTargetActive.bind(this))
            .onSet(this.setTargetActive.bind(this));
        this.services.fanV2.getCharacteristic(this.hap.Characteristic.RotationSpeed)
            .onGet(this.getTargetRotationSpeed.bind(this))
            .onSet(this.setTargetRotationSpeed.bind(this))
            .setProps({
                minStep: constants.STEP_SIZE
            });
        this.services.fanV2.getCharacteristic(this.hap.Characteristic.SwingMode)
            .onGet(this.getTargetSwingMode.bind(this))
            .onSet(this.setTargetSwingMode.bind(this));
        if (this.sensors) {
            this.services.temperatureSensor.getCharacteristic(this.hap.Characteristic.CurrentTemperature)
                .onGet(this.getCurrentTemperature.bind(this));
            this.services.humiditySensor.getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity)
                .onGet(this.getCurrentRelativeHumidity.bind(this));
        }
    }

    /**
     * Get services for accessory
     */
    getServices(): Service[] {
        let services = [
            this.services.accessoryInformation,
            this.services.fanV2
        ];
        if (this.sensors) {
            services.push(
                this.services.temperatureSensor,
                this.services.humiditySensor
            );
        }
        return services;
    }

    /**
     * Identify accessory by toggling the Active state
     */
    identify(): void {
        this.log.info(messages.IDENTIFYING);
        let i = 0;
        let activeToggle = setInterval(async () => {
            if (this.characteristics.targetActive == this.characteristics.currentActive) {
                if (i < 2) {
                    await this.setTargetActive(this.hap.Characteristic.Active.ACTIVE - this.characteristics.targetActive);
                } else {
                    clearInterval(activeToggle);
                    this.log.info(messages.IDENTIFIED);
                }
                i++;
            }
        }, constants.INTERVAL);
    }

    /**
     * Initialize the BroadLink RM
     * @private
     */
    private initDevice(): void {
        this.broadlink.on("deviceReady", device => {
            let mac = device.mac.toString("hex").replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase();
            this.log.info(messages.DEVICE_DISCOVERED.replace(messages.PLACEHOLDER, mac));
            if (this.device == null && (!this.mac || this.mac.toUpperCase() == mac)) {
                this.device = device;
                if (this.sensors) {
                    this.device.on("temperature", async (temp, humidity) => {
                        await this.setCurrentTemperature(temp);
                        await this.setCurrentRelativeHumidity(humidity);
                    });
                }
                this.log.info(messages.DEVICE_USING.replace(messages.PLACEHOLDER, mac));
            }
        });
        this.log.info(messages.DEVICE_DISCOVERING);
    }

    /**
     * Check if BroadLink RM is connected
     * @private
     */
    private async isDeviceConnected(): Promise<boolean> {
        let connected = await ping.promise.probe(this.device.host.address).then((res) => {
            return res.alive;
        });
        if (!connected) {
            if (this.skips.device == 0) {
                this.log.info(messages.DEVICE_DISCONNECTED);
            }
            this.skips.device = constants.SKIPS_DEVICE;
        } else if (this.skips.device > 0) {
            if (this.skips.device == constants.SKIPS_DEVICE - 1) {
                this.log.info(messages.DEVICE_RECONNECTING);
            }
            connected = false;
        }
        return connected;
    }

    /**
     * Decrement device skips
     * @private
     */
    private doDeviceSkip(): void {
        if (this.skips.device > 0) {
            this.skips.device--;
            if (this.skips.device == 0) {
                this.log.info(messages.DEVICE_RECONNECTED);
            }
        }
    }

    /**
     * Initialize characteristics from persist storage or defaults
     * @private
     */
    private async initCharacteristics(): Promise<void> {
        this.characteristics = await this.storage.getItem(this.name) || this.characteristics;
        this.log.info(messages.INIT_TARGET_ACTIVE
            .replace(messages.PLACEHOLDER, this.characteristics.targetActive + ""));
        this.log.info(messages.INIT_CURRENT_ACTIVE
            .replace(messages.PLACEHOLDER, this.characteristics.targetActive + ""));
        this.log.info(messages.INIT_TARGET_ROTATION_SPEED
            .replace(messages.PLACEHOLDER, this.characteristics.targetRotationSpeed + ""));
        this.log.info(messages.INIT_CURRENT_ROTATION_SPEED
            .replace(messages.PLACEHOLDER, this.characteristics.targetRotationSpeed + ""));
        this.log.info(messages.INIT_TARGET_SWING_MODE
            .replace(messages.PLACEHOLDER, this.characteristics.targetSwingMode + ""));
        this.log.info(messages.INIT_CURRENT_SWING_MODE
            .replace(messages.PLACEHOLDER, this.characteristics.targetSwingMode + ""));
        if (this.sensors) {
            this.log.info(messages.INIT_CURRENT_TEMPERATURE
                .replace(messages.PLACEHOLDER, this.characteristics.currentTemperature + ""));
            this.log.info(messages.INIT_CURRENT_RELATIVE_HUMIDITY
                .replace(messages.PLACEHOLDER, this.characteristics.currentRelativeHumidity + ""));
        }
    }

    /**
     * Get target Active
     * @private
     */
    private async getTargetActive(): Promise<CharacteristicValue> {
        return this.characteristics.targetActive;
    }

    /**
     * Set target Active
     * @param value New value to set
     * @private
     */
    private async setTargetActive(value: CharacteristicValue): Promise<void> {
        if (value as number != this.characteristics.targetActive) {
            this.characteristics.targetActive = value as number;
            await this.storage.setItem(this.name, this.characteristics);
            this.log.info(messages.SET_TARGET_ACTIVE
                .replace(messages.PLACEHOLDER, this.characteristics.targetActive + ""));
        }
    }

    /**
     * Check if current Active can be updated
     * @private
     */
    private canUpdateCurrentActive(): boolean {
        return this.characteristics.currentActive != this.characteristics.targetActive &&
            this.skips.active == 0;
    }

    /**
     * Update current Active based on target Active
     * @private
     */
    private async updateCurrentActive(): Promise<void> {
        this.device.sendData(Buffer.from(constants.SIGNAL_ACTIVE, "hex"));
        this.characteristics.currentActive = this.characteristics.targetActive;
        this.skips.active = this.characteristics.currentActive ? constants.SKIPS_ACTIVE : constants.SKIPS_INACTIVE;
        this.skips.swingMode = 0;
        await this.storage.setItem(this.name, this.characteristics);
        this.log.info(messages.UPDATED_CURRENT_ACTIVE
            .replace(messages.PLACEHOLDER, this.characteristics.currentActive + ""));
    }

    /**
     * Decrement Active skips
     * @private
     */
    private doActiveSkip(): void {
        if (this.skips.active > 0) {
            this.skips.active--;
        }
    }

    /**
     * Get target Rotation Speed
     * @private
     */
    private async getTargetRotationSpeed(): Promise<CharacteristicValue> {
        return this.characteristics.targetRotationSpeed;
    }

    /**
     * Set target Rotation Speed
     * @param value New value to set
     * @private
     */
    private async setTargetRotationSpeed(value: CharacteristicValue): Promise<void> {
        let tempValue = value as number;
        if (tempValue < constants.STEP_SIZE) {
            tempValue = constants.STEP_SIZE;
            this.services.fanV2.updateCharacteristic(this.hap.Characteristic.RotationSpeed, tempValue);
        }
        if (tempValue != this.characteristics.targetRotationSpeed) {
            this.characteristics.targetRotationSpeed = tempValue;
            await this.storage.setItem(this.name, this.characteristics);
            this.log.info(messages.SET_TARGET_ROTATION_SPEED
                .replace(messages.PLACEHOLDER, this.characteristics.targetRotationSpeed + ""));
        }
    }

    /**
     * Check if current Rotation Speed can be updated
     * @private
     */
    private canUpdateCurrentRotationSpeed(): boolean {
        return this.characteristics.currentRotationSpeed != this.characteristics.targetRotationSpeed &&
            this.characteristics.currentActive == this.hap.Characteristic.Active.ACTIVE &&
            this.skips.active == 0 &&
            this.skips.swingMode == 0;
    }

    /**
     * Update current Rotation Speed based on target Rotation Speed
     * @private
     */
    private async updateCurrentRotationSpeed(): Promise<void> {
        if (this.characteristics.currentRotationSpeed < this.characteristics.targetRotationSpeed) {
            this.device.sendData(Buffer.from(constants.SIGNAL_ROTATION_SPEED_UP, "hex"));
            this.characteristics.currentRotationSpeed += constants.STEP_SIZE;
        } else if (this.characteristics.currentRotationSpeed > this.characteristics.targetRotationSpeed) {
            this.device.sendData(Buffer.from(constants.SIGNAL_ROTATION_SPEED_DOWN, "hex"));
            this.characteristics.currentRotationSpeed -= constants.STEP_SIZE;
        }
        await this.storage.setItem(this.name, this.characteristics);
        this.log.info(messages.UPDATED_CURRENT_ROTATION_SPEED
            .replace(messages.PLACEHOLDER, this.characteristics.currentRotationSpeed + ""));
    }

    /**
     * Get target Swing Mode
     * @private
     */
    private async getTargetSwingMode(): Promise<CharacteristicValue> {
        return this.characteristics.targetSwingMode;
    }

    /**
     * Set target Swing Mode
     * @param value New value to set
     * @private
     */
    private async setTargetSwingMode(value: CharacteristicValue): Promise<void> {
        if (value as number != this.characteristics.targetSwingMode) {
            this.characteristics.targetSwingMode = value as number;
            await this.storage.setItem(this.name, this.characteristics);
            this.log.info(messages.SET_TARGET_SWING_MODE
                .replace(messages.PLACEHOLDER, this.characteristics.targetSwingMode + ""));
        }
    }

    /**
     * Check if current Swing Mode can be updated
     * @private
     */
    private canUpdateCurrentSwingMode(): boolean {
        return this.characteristics.currentSwingMode != this.characteristics.targetSwingMode &&
            this.characteristics.currentActive == this.hap.Characteristic.Active.ACTIVE &&
            this.skips.active == 0;
    }

    /**
     * Update current Swing Mode based on target Swing Mode
     * @private
     */
    private async updateCurrentSwingMode(): Promise<void> {
        this.device.sendData(Buffer.from(constants.SIGNAL_SWING_MODE, "hex"));
        this.characteristics.currentSwingMode = this.characteristics.targetSwingMode;
        this.skips.swingMode = constants.SKIPS_SWING_MODE;
        await this.storage.setItem(this.name, this.characteristics);
        this.log.info(messages.UPDATED_CURRENT_SWING_MODE
            .replace(messages.PLACEHOLDER, this.characteristics.currentSwingMode + ""));
    }

    /**
     * Decrement Swing Mode skips
     * @private
     */
    private doSwingModeSkip(): void {
        if (this.skips.swingMode > 0) {
            this.skips.swingMode--;
        }
    }

    /**
     * Get Current Temperature
     * @private
     */
    private async getCurrentTemperature(): Promise<CharacteristicValue> {
        return this.characteristics.currentTemperature;
    }

    /**
     * Set Current Temperature
     * @param value New value to set
     * @private
     */
    private async setCurrentTemperature(value: CharacteristicValue): Promise<void> {
        if (value as number != this.characteristics.currentTemperature) {
            this.characteristics.currentTemperature = value as number;
            await this.storage.setItem(this.name, this.characteristics);
            this.log.info(messages.SET_CURRENT_TEMPERATURE
                .replace(messages.PLACEHOLDER, this.characteristics.currentTemperature + ""));
        }
    }

    /**
     * Get Current Relative Humidity
     * @private
     */
    private async getCurrentRelativeHumidity(): Promise<CharacteristicValue> {
        return this.characteristics.currentRelativeHumidity;
    }

    /**
     * Set Current Relative Humidity
     * @param value New value to set
     * @private
     */
    private async setCurrentRelativeHumidity(value: CharacteristicValue): Promise<void> {
        if (value as number != this.characteristics.currentRelativeHumidity) {
            this.characteristics.currentRelativeHumidity = value as number;
            await this.storage.setItem(this.name, this.characteristics);
            this.log.info(messages.SET_CURRENT_RELATIVE_HUMIDITY
                .replace(messages.PLACEHOLDER, this.characteristics.currentRelativeHumidity + ""));
        }
    }
}
