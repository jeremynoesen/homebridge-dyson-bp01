# homebridge-dyson-bp01 [![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

## About
This Homebridge plugin adds a Dyson BP01 fan to HomeKit in conjunction with a BroadLink RM.

## Purpose
There are currently plugins that can control a BroadLink RM to control many other devices; however, they would break if you try to change more than one characteristic of the accessory at once. This plugin solves that specifically for the Dyson BP01.

## Required Devices
This plugin is designed to be used with the following devices:
- A BroadLink RM supported by [this library](https://github.com/kiwi-cam/broadlinkjs-rm)
- A Dyson BP01

## Device Setup
### BroadLink RM Setup
1. Set up your BroadLink RM with the BroadLink app.
   1. For standard setup, go through the full setup process in the app. Then, in device properties, disable `Lock device`.
   2. For local network setup, go through the in-app setup, but stop at the "Add Devices" page. Then, close the app.
2. Place the device within line-of-sight of the Dyson's display.

### Dyson BP01 Setup
1. Set the fan speed to 1.
2. Turn off oscillation.
3. Turn off the fan itself.

## Required Software
- Node.JS v14 or greater
- Homebridge 1.3.0 or greater

## Building
You can build the project by doing the following:
- Clone or download this repository.
- run `npm run build` in the folder of the repository through the Homebridge terminal.

## Installation
There are multiple ways to install this plugin:

- Search for `homebridge-dyson-bp01` on the Homebridge plugins page, then click `Install` on this plugin.
- Run `hb-service add homebridge-dyson-bp01` through the Homebridge terminal.
- Run `npm install homebridge-dyson-bp01` through the Homebridge terminal.
- If you manually built the project, run `npm install path/to/project` through the Homebridge terminal.

After any of these, restart Homebridge.

## Configuration
It is recommended that you use the Homebridge config UI to configure this plugin! If you choose to not do this, to add the device to Homebridge, add the following to your accessories in the Homebridge config:
```json
{
  "accessory": "DysonBP01",
  "name": "Dyson Pure Cool Me",
  "mac": "XX:XX:XX:XX:XX:XX"
}
```
- The `mac` option is optional, but recommended if you have multiple BroadLink RMs. This will ensure the correct device is selected to control your fan.
- Every time you change `name`, you will need to set fan speed back to 1, oscillation off, and fan power off to re-sync the machine.

After adding this, restart Homebridge for your changes to take effect.
- If no BroadLink RM is found, the accessory will not be able to update, and will not send signals to your Dyson BP01.
- If one is found, you should be able to control your fan like a native HomeKit accessory.

## Troubleshooting
- If your BroadLink RM randomly stops working or does not reconnect after power loss, try assigning it a static IP address.
- If not all signals are sending, check the position of your BroadLink RM and ensure it has a direct line-of-sight to the screen on the fan.