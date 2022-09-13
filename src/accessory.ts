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
import storage from "node-persist";

let hap: HAP;
const broadlink = require("./broadlink.js");

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("DysonBP01", DysonBP01);
};

/**
 * Dyson BP01 accessory for Homebridge
 * @author Jeremy Noesen
 */
class DysonBP01 implements AccessoryPlugin {
    private readonly fanService: Service;
    private readonly informationService: Service;

    /**
     * Create the DysonBP01 accessory
     */
    constructor(log: Logging, config: AccessoryConfig, api: API) {

        // initialize node-persist storage
        const persist = storage.create();
        persist.init({dir: api.user.persistPath(), forgiveParseErrors: true});

        // accessory state variables
        let currentPower = false;
        let currentSpeed = 1;
        let currentOscillation = 0;
        let targetPower = false;
        let targetSpeed = 1;
        let targetOscillation = 0;

        // setup homebridge services
        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Manufacturer, "Dyson")
            .setCharacteristic(hap.Characteristic.Model, "BP01");
        this.fanService = new hap.Service.Fanv2(config.name);
        this.fanService.getCharacteristic(hap.Characteristic.On)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, currentPower);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                targetPower = value as boolean;
                log.info("Power set to " + (targetPower ? "ON" : "OFF"));
                callback();
            });
        this.fanService.getCharacteristic(hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, currentPower);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                callback();
            });
        this.fanService.getCharacteristic(hap.Characteristic.RotationSpeed)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, currentSpeed * 10);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                targetSpeed = (value as number) / 10;
                log.info("Speed set to " + targetSpeed);
                callback();
            })
            .setProps({
                minStep: 10
            });
        this.fanService.getCharacteristic(hap.Characteristic.SwingMode)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(undefined, currentOscillation);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                targetOscillation = value as number;
                log.info("Oscillation set to " + (targetOscillation == 1 ? "ON" : "OFF"));
                callback();
            });

        // load previous state from storage
        setTimeout(async () => {
            currentPower = targetPower = await persist.getItem(config.name + " power") || false;
            currentSpeed = targetSpeed = await persist.getItem(config.name + " speed") || 1;
            currentOscillation = targetOscillation = await persist.getItem(config.name + " oscillation") || 0;
            log.info("Power is " + (currentPower ? "ON" : "OFF"));
            log.info("Speed is " + currentSpeed);
            log.info("Oscillation is " + (currentOscillation == 1 ? "ON" : "OFF"));
        }, 0);

        // discover broadlink rm device
        broadlink.discover();
        log.info("Searching for BroadLink RM...");
        broadlink.on("deviceReady", device => {
            if (!config.mac || device.mac.toString("hex") == config.mac.split(":").join("")) {
                log.info("BroadLink RM discovered!");

                // update accessory states
                let oscillationSkip = 0;
                setInterval(async () => {
                    if (currentPower != targetPower) {
                        device.sendData(Buffer.from("260050004a1618191719181819301719181818181819173118191818181919171818181818191917183018181819183018000699481818311900068c471918301800068e481817321900068c4719183018000d050000000000000000", "hex"));
                        currentPower = targetPower;
                        await persist.setItem(config.name + " power", currentPower);

                    } else if (currentSpeed < targetSpeed && currentPower && oscillationSkip == 0) {
                        device.sendData(Buffer.from("260050004719171a1718181818311818181818191917183018181a2e19181830171a17301b2e1831171918301731181917000685471917311800068d481818311a00068c481818311800068d4719183018000d050000000000000000", "hex"));
                        currentSpeed += 1;
                        await persist.setItem(config.name + " speed", currentSpeed);

                    } else if (currentSpeed > targetSpeed && currentPower && oscillationSkip == 0) {
                        device.sendData(Buffer.from("26005800481818191818171918301819191718181917183118181830181917311830171a17191a2e18181819183018311700069d471917311800068e481818311700068f471818311800068e491818301800068e4719183018000d05", "hex"));
                        currentSpeed -= 1;
                        await persist.setItem(config.name + " speed", currentSpeed);

                    } else if (currentOscillation != targetOscillation && currentPower) {
                        device.sendData(Buffer.from("2600580048181819171918181830181918181818181818311819171918301830181917191830173118181a2e1819171918000692491818301800068d471918301800068d481818311800068e471818311900068c4818193018000d05", "hex"));
                        currentOscillation = targetOscillation;
                        await persist.setItem(config.name + " oscillation", currentOscillation);
                        oscillationSkip = Math.ceil(3000 / (config.interval || 650));
                    }
                    if (oscillationSkip > 0) oscillationSkip--;
                }, (config.interval || 650));
            }
        });
    }

    /**
     * Get the services for this accessory
     */
    getServices(): Service[] {
        return [
            this.informationService,
            this.fanService,
        ];
    }
}
