import mqtt from 'mqtt';

class MQTTClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.subscriptions = new Map();
    this.messageCallbacks = new Map();
  }

  connect(brokerUrl, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`🔗 Connecting to MQTT: ${brokerUrl}`);
        
        this.client = mqtt.connect(brokerUrl, {
          clientId: 'biosort-web-' + Math.random().toString(16).substr(2, 8),
          clean: true,
          connectTimeout: 4000,
          reconnectPeriod: 2000,
          ...options
        });

        this.client.on('connect', () => {
          console.log('✅ MQTT Connected to broker');
          this.isConnected = true;
          resolve(this.client);
        });

        this.client.on('error', (error) => {
          console.error('❌ MQTT Connection error:', error);
          this.isConnected = false;
          reject(error);
        });

        this.client.on('close', () => {
          console.log('🔌 MQTT Connection closed');
          this.isConnected = false;
        });

        this.client.on('message', (topic, message) => {
          console.log(`📨 MQTT Message: ${topic}`, message.toString().substring(0, 100));
          
          // Call topic-specific callbacks
          if (this.subscriptions.has(topic)) {
            const callback = this.subscriptions.get(topic);
            callback(message.toString());
          }
          
          // Call general message callbacks
          this.messageCallbacks.forEach((callback) => {
            callback(topic, message.toString());
          });
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  subscribe(topic, callback) {
    if (!this.client || !this.isConnected) {
      console.error('MQTT client not connected');
      return false;
    }

    this.client.subscribe(topic, (err) => {
      if (err) {
        console.error(`❌ Failed to subscribe to ${topic}:`, err);
      } else {
        console.log(`✅ Subscribed to ${topic}`);
        this.subscriptions.set(topic, callback);
      }
    });
  }

  publish(topic, message) {
    if (!this.client || !this.isConnected) {
      console.error('MQTT client not connected');
      return false;
    }

    console.log(`📤 MQTT Publish: ${topic}`, message);
    this.client.publish(topic, message);
  }

  onMessage(callback) {
    const id = Math.random().toString(36);
    this.messageCallbacks.set(id, callback);
    return id;
  }

  offMessage(id) {
    this.messageCallbacks.delete(id);
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
      this.subscriptions.clear();
      this.messageCallbacks.clear();
    }
  }
}

export const mqttClient = new MQTTClient();