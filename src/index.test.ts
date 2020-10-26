import UltimateSerializer from '.';

class Boy {
    constructor(public name: string, public girlfriend?: Girl) {}
}
class Girl {
    constructor(public name: string, public boyfriend?: Boy) {}
}

const Alice = new Girl('Alice');
const Bob = new Boy('Bob');

Alice.boyfriend = Bob;
Bob.girlfriend = Alice;

const serializer = new UltimateSerializer();

serializer
    .define({
        type: 'Boy',
        serialize(data: any) {
            if (!(data instanceof Boy)) return false;

            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve([data.name, data.girlfriend]);
                }, 5000);
            });
        },
        deserialize(data) {
            return new Boy(data[0], data[1]);
        },
    })
    .define({
        type: 'Girl',
        serialize(data: any) {
            if (!(data instanceof Girl)) return false;

            return [data.name, data.boyfriend];
        },
        deserialize(data) {
            return new Girl(data[0], data[1]);
        },
    });

serializer.serialize(Alice, 'Promise<Uint8Array>').then((bytes) => {
    console.log(bytes);
});
