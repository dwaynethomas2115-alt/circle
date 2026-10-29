import type {Result} from '../types';
export interface PollOption {id:string;label:string}
export interface CirclePoll {id:string;circleId:string;authorId:string;question:string;options:PollOption[];createdAt:string;closesAt?:string;closed:boolean}
export interface PollVote {pollId:string;userId:string;optionId:string}
export interface CircleEvent {id:string;circleId:string;authorId:string;title:string;description:string;location:string;startsAt:string;endsAt:string;createdAt:string}
export interface EventRSVP {eventId:string;userId:string;response:'going'|'maybe'|'not_going'}
export interface CircleTheme {id:string;label:string;prompt:string;accent:string;background:string;surface:string;ink:string;motif:'garden'|'unicorn'|'vegas'|'coast'|'minimal';source:'preset'|'ai'}
export interface ReadState {circleId:string;userId:string;seenAt:string}
export interface FeatureState {version:1;polls:CirclePoll[];votes:PollVote[];events:CircleEvent[];rsvps:EventRSVP[];themes:Record<string,CircleTheme>;readStates:ReadState[]}
export interface CreateEventInput {circleId:string;title:string;description:string;location:string;startsAt:string;endsAt:string}
export interface ThemeResult extends Result {theme?:CircleTheme}
export interface FeatureActions {
 createPoll(circleId:string,question:string,options:string[],closesAt?:string):Promise<Result>;
 vote(pollId:string,optionId:string):Promise<Result>;
 closePoll(pollId:string):Promise<Result>;
 deletePoll(pollId:string):Promise<Result>;
 createEvent(input:CreateEventInput):Promise<Result>;
 deleteEvent(eventId:string):Promise<Result>;
 rsvpEvent(eventId:string,response:EventRSVP['response']):Promise<Result>;
 markCaughtUp(circleId:string,seenAt?:string):Promise<Result>;
 saveTheme(circleId:string,theme:CircleTheme):Promise<Result>;
 generateTheme(circleId:string,prompt:string):Promise<ThemeResult>;
}
export interface FeatureContextValue extends FeatureState {ready:boolean;error:string|null;actions:FeatureActions}
