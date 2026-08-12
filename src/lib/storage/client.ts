import { IndexedDbRepository } from './indexeddb';
import type { LocalRepository } from './repository';

let repository: LocalRepository | null = null;

export function getLocalRepository(): LocalRepository {
    if (typeof window === 'undefined') throw new Error('本地数据只能在浏览器中访问');
    repository ??= new IndexedDbRepository();
    return repository;
}
