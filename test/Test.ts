import {Tata} from "./Tata";
import {Tata as TataBla} from "./bla/Tata";
import {validate} from "ts-validate-schema";


export class Toto {
    titi?: string;
    tata?: Tata;
    bla?: TataBla;
}

const res = validate<Toto>({});

console.log(res);
