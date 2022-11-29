import {AccessoryConfig, AccessoryPlugin, API, CharacteristicValue, HAP, Logging, Service} from "homebridge";
import storage from "node-persist";
import ping from "ping";
import * as constants from "./helpers/constants";
import * as messages from "./helpers/messages";

const broadlink = require("./helpers/broadlink");
let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory(constants.ACCESSORY_ID, DysonBP01);
};

/**
 * Dyson BP01 accessory for Homebridge
 */
class DysonBP01 implements AccessoryPlugin {

    /**
     * Services to provide accessory information and controls
     * @private
     */
    private readonly services: {
        readonly information: Service,
        readonly fan: Service
    };

    /**
     * Homebridge logger
     * @private
     */
    private readonly log: Logging;

    /**
     * Accessory name
     * @private
     */
    private readonly name: string;

    /**
     * MAC address of BroadLink RM
     * @private
     */
    private readonly mac: string;

    /**
     * Node-persist storage
     * @private
     */
    private readonly storage: storage.LocalStorage;

    /**
     * Loop skips
     * @private
     */
    private readonly skips: {
        active: number,
        swingMode: number,
        device: number
    };

    /**
     * BroadLink RM
     * @private
     */
    private device: any;

    /**
     * Characteristic states
     * @private
     */
    private characteristics: {
        currentActive: number,
        targetActive: number,
        currentRotationSpeed: number,
        targetRotationSpeed: number,
        currentSwingMode: number,
        targetSwingMode: number
    };

    /**
     * Create the DysonBP01 accessory
     * @param log Homebridge logging instance
     * @param config Homebridge config
     * @param api Homebridge API
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.name = config.name;
        this.mac = config.mac;
        this.device = null;
        this.characteristics = {
            currentActive: hap.Characteristic.Active.INACTIVE,
            targetActive: hap.Characteristic.Active.INACTIVE,
            currentRotationSpeed: constants.STEP_SIZE,
            targetRotationSpeed: constants.STEP_SIZE,
            currentSwingMode: hap.Characteristic.SwingMode.SWING_DISABLED,
            targetSwingMode: hap.Characteristic.SwingMode.SWING_DISABLED
        };
        this.skips = {
            active: 0,
            swingMode: 0,
            device: 0
        };
        this.services = {
            information: new hap.Service.AccessoryInformation(),
            fan: new hap.Service.Fanv2(config.name)
        };
        this.storage = storage.create();
        this.storage.init({dir: api.user.persistPath(), forgiveParseErrors: true}).then(() => {
            this.initServices();
            this.initCharacteristics().then(() => {
                this.initDevice();
                this.initLoop();
            });
        });
    }

    /**
     * Start the loop that updates the accessory
     * @private
     */
    private initLoop(): void {
        setInterval(async () => {
            if (this.device == null) {
                broadlink.discover();
            } else {
                if (await this.isDeviceConnected()) {
                    if (this.canUpdateActive()) {
                        await this.updateActive();
                    } else if (this.canUpdateRotationSpeed()) {
                        await this.updateRotationSpeed();
                    } else if (this.canUpdateSwingMode()) {
                        await this.updateSwingMode();
                    }
                }
                this.doActiveSkip();
                this.doSwingModeSkip();
                this.doDeviceSkip();
            }
        }, constants.INTERVAL);
    }

    /**
     * Initialize the services for this accessory
     * @private
     */
    private initServices(): void {
        this.services.information
            .updateCharacteristic(hap.Characteristic.Manufacturer, messages.INFO_MANUFACTURER)
            .updateCharacteristic(hap.Characteristic.Model, messages.INFO_MODEL)
            .updateCharacteristic(hap.Characteristic.SerialNumber, messages.INFO_SERIAL_NUMBER);
        this.services.fan.getCharacteristic(hap.Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));
        this.services.fan.getCharacteristic(hap.Characteristic.RotationSpeed)
            .onGet(this.getRotationSpeed.bind(this))
            .onSet(this.setRotationSpeed.bind(this))
            .setProps({
                minStep: constants.STEP_SIZE
            });
        this.services.fan.getCharacteristic(hap.Characteristic.SwingMode)
            .onGet(this.getSwingMode.bind(this))
            .onSet(this.setSwingMode.bind(this));
    }

    /**
     * Get the services for this accessory
     */
    getServices(): Service[] {
        return [
            this.services.information,
            this.services.fan,
        ];
    }

    /**
     * Identify the accessory through HomeKit
     */
    identify(): void {
        if (this.device == null) {
            this.log.info(messages.IDENTIFY_NOT_CONNECTED);
        } else {
            this.log.info(messages.IDENTIFY_CONNECTED.replace(messages.PLACEHOLDER,
                this.device.mac.toString("hex").replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase()));
        }
    }

    /**
     * Search for a BroadLink RM
     * @private
     */
    private initDevice(): void {
        broadlink.on("deviceReady", device => {
            let mac = device.mac.toString("hex").replace(/(.{2})/g, "$1:").slice(0, -1).toUpperCase();
            if (this.device == null && (!this.mac || mac == this.mac.toUpperCase())) {
                this.device = device;
                this.log.info(messages.DEVICE_DISCOVERED.replace(messages.PLACEHOLDER, mac));
            }
        });
        this.log.info(messages.DEVICE_SEARCHING);
    }

    /**
     * Check if the BroadLink RM is connected
     * @private
     */
    private async isDeviceConnected(): Promise<boolean> {
        let connected = await ping.promise.probe(this.device.host.address).then((res) => {
            return res.alive;
        });
        if (!connected) {
            if (this.skips.device == 0) {
                this.log.info(messages.DEVICE_RECONNECTING);
            }
            this.skips.device = constants.SKIPS_DEVICE;
        } else if (this.skips.device > 0) {
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
     * Initialize all characteristics from a previous saved state or from defaults
     * @private
     */
    private async initCharacteristics(): Promise<void> {
        this.characteristics = await this.storage.getItem(this.name) || this.characteristics;
        this.log.info(messages.ACTIVE_INIT
            .replace(messages.PLACEHOLDER, this.characteristics.targetActive + ""));
        this.log.info(messages.ROTATION_SPEED_INIT
            .replace(messages.PLACEHOLDER, this.characteristics.targetRotationSpeed + ""));
        this.log.info(messages.SWING_MODE_INIT
            .replace(messages.PLACEHOLDER, this.characteristics.targetSwingMode + ""));
    }

    /**
     * Get the active characteristic
     * @private
     */
    private async getActive(): Promise<CharacteristicValue> {
        return this.characteristics.targetActive;
    }

    /**
     * Set the active characteristic
     * @param value value received from Homebridge
     * @private
     */
    private async setActive(value: CharacteristicValue): Promise<void> {
        if (value as number != this.characteristics.targetActive) {
            this.characteristics.targetActive = value as number;
            await this.storage.setItem(this.name, this.characteristics);
            this.log.info(messages.ACTIVE_SET
                .replace(messages.PLACEHOLDER, this.characteristics.targetActive + ""));
        }
    }

    /**
     * Check if the current active characteristic can be updated
     * @private
     */
    private canUpdateActive(): boolean {
        return this.characteristics.currentActive != this.characteristics.targetActive &&
            this.skips.active == 0;
    }

    /**
     * Update current active characteristic based on the target active state
     * @private
     */
    private async updateActive(): Promise<void> {
        this.device.sendData(Buffer.from(constants.SIGNAL_ACTIVE, "hex"));
        this.characteristics.currentActive = this.characteristics.targetActive;
        this.skips.active = this.characteristics.currentActive ? constants.SKIPS_ACTIVE : constants.SKIPS_INACTIVE;
        this.skips.swingMode = 0;
        await this.storage.setItem(this.name, this.characteristics);
    }

    /**
     * Decrement active skips
     * @private
     */
    private doActiveSkip(): void {
        if (this.skips.active > 0) {
            this.skips.active--;
        }
    }

    /**
     * Get the rotation speed
     * @private
     */
    private async getRotationSpeed(): Promise<CharacteristicValue> {
        return this.characteristics.targetRotationSpeed;
    }

    /**
     * Set the rotation speed
     * @param value value received from Homebridge
     * @private
     */
    private async setRotationSpeed(value: CharacteristicValue): Promise<void> {
        let clampedRotationSpeed = Math.max(constants.STEP_SIZE, value as number);
        if (clampedRotationSpeed != this.characteristics.targetRotationSpeed) {
            this.characteristics.targetRotationSpeed = clampedRotationSpeed;
            await this.storage.setItem(this.name, this.characteristics);
            this.log.info(messages.ROTATION_SPEED_SET
                .replace(messages.PLACEHOLDER, this.characteristics.targetRotationSpeed + ""));
        }
    }

    /**
     * Check if the current rotation speed can be updated
     * @private
     */
    private canUpdateRotationSpeed(): boolean {
        return this.characteristics.currentRotationSpeed != this.characteristics.targetRotationSpeed &&
            this.characteristics.currentActive == hap.Characteristic.Active.ACTIVE &&
            this.skips.active == 0 &&
            this.skips.swingMode == 0;
    }

    /**
     * Update current rotation speed based on the target rotation speed
     * @private
     */
    private async updateRotationSpeed(): Promise<void> {
        if (this.characteristics.currentRotationSpeed < this.characteristics.targetRotationSpeed) {
            this.device.sendData(Buffer.from(constants.SIGNAL_ROTATION_SPEED_UP, "hex"));
            this.characteristics.currentRotationSpeed += constants.STEP_SIZE;
        } else if (this.characteristics.currentRotationSpeed > this.characteristics.targetRotationSpeed) {
            this.device.sendData(Buffer.from(constants.SIGNAL_ROTATION_SPEED_DOWN, "hex"));
            this.characteristics.currentRotationSpeed -= constants.STEP_SIZE;
        }
        await this.storage.setItem(this.name, this.characteristics);
    }

    /**
     * Get the swing mode
     * @private
     */
    private async getSwingMode(): Promise<CharacteristicValue> {
        return this.characteristics.targetSwingMode;
    }

    /**
     * Set the swing mode
     * @param value value received from Homebridge
     * @private
     */
    private async setSwingMode(value: CharacteristicValue): Promise<void> {
        if (value as number != this.characteristics.targetSwingMode) {
            this.characteristics.targetSwingMode = value as number;
            await this.storage.setItem(this.name, this.characteristics);
            this.log.info(messages.SWING_MODE_SET
                .replace(messages.PLACEHOLDER, this.characteristics.targetSwingMode + ""));
        }
    }

    /**
     * Check if the current swing mode can be updated
     * @private
     */
    private canUpdateSwingMode(): boolean {
        return this.characteristics.currentSwingMode != this.characteristics.targetSwingMode &&
            this.characteristics.currentActive == hap.Characteristic.Active.ACTIVE &&
            this.skips.active == 0;
    }

    /**
     * Update current swing mode based on the target swing mode
     * @private
     */
    private async updateSwingMode(): Promise<void> {
        this.device.sendData(Buffer.from(constants.SIGNAL_SWING_MODE, "hex"));
        this.characteristics.currentSwingMode = this.characteristics.targetSwingMode;
        this.skips.swingMode = constants.SKIPS_SWING_MODE;
        await this.storage.setItem(this.name, this.characteristics);
    }

    /**
     * Decrement swing mode skips
     * @private
     */
    private doSwingModeSkip(): void {
        if (this.skips.swingMode > 0) {
            this.skips.swingMode--;
        }
    }
}
