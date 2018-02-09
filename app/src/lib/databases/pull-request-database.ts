import Dexie from 'dexie'
import { APIRefState, IAPIRefStatusItem } from '../api'
import { BaseDatabase } from './base-database'

export interface IPullRequestRef {
  /**
   * The database ID of the GitHub repository in which this ref lives. It could
   * be null if the repository was deleted on the site after the PR was opened.
   */
  readonly repository_id: number | null

  /** The name of the ref. */
  readonly ref: string

  /** The SHA of the ref. */
  readonly sha: string
}

export interface IPullRequest {
  /**
   * The database ID. This will be undefined if the pull request hasn't been
   * inserted into the DB.
   */
  readonly _id?: number

  /** The GitHub PR number. */
  readonly number: number

  /** The title. */
  readonly title: string

  /** The string formatted date on which the PR was created. */
  readonly created_at: string

  /** The ref from which the pull request's changes are coming. */
  readonly head: IPullRequestRef

  /** The ref which the pull request is targetting. */
  readonly base: IPullRequestRef

  /** The login of the author. */
  readonly author: string
}

export interface IPullRequestStatus {
  /**
   * The database ID. This will be undefined if the status hasn't been inserted
   * into the DB.
   */
  readonly _id?: number

  /** The ID of the pull request in the database. */
  readonly pull_request_id: number

  /** The status' state. */
  readonly state: APIRefState

  /** The number of statuses represented in this combined status. */
  readonly total_count: number

  /** The SHA for which this status applies. */
  readonly sha: string

  /**
   * The list of statuses for this specific ref or undefined
   * if the database object was created prior to status support
   * being added in #3588
   */
  readonly status: ReadonlyArray<IAPIRefStatusItem>
}

export class PullRequestDatabase extends BaseDatabase {
  public pullRequest: Dexie.Table<IPullRequest, number>
  public pullRequestStatus: Dexie.Table<IPullRequestStatus, number>

  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    console.trace('In constructor')

    this.conditionalVersion(1, {
      pullRequests: 'id++, base.repoId',
    })

    this.conditionalVersion(2, {
      pullRequestStatus: 'id++, &[sha+pullRequestId]',
    })

    this.conditionalVersion(3, {
      pullRequestStatus: 'id++, &[sha+pullRequestId], pullRequestId',
    })

    // we need to run the upgrade function to ensure we add
    // a status field to all previous records
    this.conditionalVersion(4, {}, this.addStatusesField)
  }

  private addStatusesField = async (transaction: Dexie.Transaction) => {
    const table = this.pullRequestStatus

    await table.toCollection().modify(async prStatus => {
      if (prStatus.status == null) {
        const newPrStatus = { statuses: [], ...prStatus }

        await table
          .where('[sha+pullRequestId]')
          .equals([prStatus.sha, prStatus.pull_request_id])
          .delete()

        await table.add(newPrStatus)
      }
    })
  }
}
